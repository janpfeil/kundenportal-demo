#!/usr/bin/env python3
"""Resets the owner tenant's demo data: deletes every item of the tenant, then empties the DLQs.

Removes all items whose partition key starts with `TENANT#owner#` (customers, contracts,
readings, documents, mailboxes, directories, migration records and timeline, products) and
the tenant's entries of the daily data volume check (`SCHEDULE#DATAVOLUME` /
`TENANT#owner#…`). Keeps everything else: platform items (passes, quotas), pass tenants'
tables, Cognito users, the legacy systems and uploaded files (deleted after 7 days anyway).
The default product catalogue seeds itself again on its first read; a user who signs in
again gets a fresh profile with demo contracts and a welcome note.

Deletes items directly, without domain events: one paced Scan, then batches of 25 at a few
write units a second (the table has 5), so it takes about half an hour for ~8,000 items.
Run it in a terminal of its own while nobody uses the portal, and only after the workers
stopped retrying (no DynamoDB throttling for a few minutes).

    AWS_PROFILE=kundenportal scripts/reset-owner-data.py          # dry run
    AWS_PROFILE=kundenportal scripts/reset-owner-data.py --apply  # reset

Needs boto3. Reads the table name from SSM.
"""
import argparse
import collections
import time

import boto3

TENANT_PREFIX = "TENANT#owner#"
SCHEDULE_PK = "SCHEDULE#DATAVOLUME"
DLQ_MARKER = "Dlq"  # the app stack's dead-letter queues (KundenportalApp-…Dlq…)


def is_tenant_item(key):
    pk, sk = key["PK"], key["SK"]
    return pk.startswith(TENANT_PREFIX) or (pk == SCHEDULE_PK and sk.startswith(TENANT_PREFIX))


def kind(pk):
    """`TENANT#owner#CUST#c-1` → `CUST`, `SCHEDULE#DATAVOLUME` → itself, other → its first part."""
    if pk.startswith(TENANT_PREFIX):
        return pk[len(TENANT_PREFIX):].split("#", 1)[0]
    return pk if pk == SCHEDULE_PK else pk.split("#", 1)[0]


def scan_keys(table):
    """All keys of the table, by a paced Scan (100 items a page, 1 s apart)."""
    keys, kwargs = [], {"Limit": 100, "ProjectionExpression": "PK, SK"}
    while True:
        page = table.scan(**kwargs)
        keys.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            return keys
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        time.sleep(1)


def delete(client, table_name, keys, per_second):
    """Batches of 25 deletes, at most `per_second` write units on average; retries leftovers."""
    batches = [keys[i:i + 25] for i in range(0, len(keys), 25)]
    started = time.monotonic()
    for n, batch in enumerate(batches, 1):
        requests = [{"DeleteRequest": {"Key": {"PK": {"S": k["PK"]}, "SK": {"S": k["SK"]}}}} for k in batch]
        wait = 1.0
        while requests:
            result = client.batch_write_item(RequestItems={table_name: requests})
            requests = result.get("UnprocessedItems", {}).get(table_name, [])
            if requests:
                time.sleep(wait)
                wait = min(wait * 2, 30)
        if n % 20 == 0 or n == len(batches):
            minutes = (time.monotonic() - started) / 60
            print(f"{n}/{len(batches)} batches deleted ({minutes:.1f} min)", flush=True)
        time.sleep(len(batch) / per_second)


def purge_dlqs(sqs):
    for url in sqs.list_queues(QueueNamePrefix="KundenportalApp-").get("QueueUrls", []):
        if DLQ_MARKER not in url.rsplit("/", 1)[-1]:
            continue
        count = sqs.get_queue_attributes(
            QueueUrl=url, AttributeNames=["ApproximateNumberOfMessages"]
        )["Attributes"]["ApproximateNumberOfMessages"]
        if count != "0":
            sqs.purge_queue(QueueUrl=url)
            print(f"purged {url.rsplit('/', 1)[-1]} ({count} messages)")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="delete and purge (default: dry run)")
    parser.add_argument("--wcu", type=float, default=4, help="write units per second (default 4)")
    args = parser.parse_args()

    session = boto3.Session(region_name="eu-central-1")
    table_name = session.client("ssm").get_parameter(Name="/kundenportal/base/table-name")["Parameter"]["Value"]
    keys = scan_keys(session.resource("dynamodb").Table(table_name))
    doomed = [k for k in keys if is_tenant_item(k)]
    kept = [k for k in keys if not is_tenant_item(k)]

    print(f"table {table_name}: {len(keys)} items")
    print(f"to delete: {len(doomed)}")
    for name, count in collections.Counter(kind(k["PK"]) for k in doomed).most_common():
        print(f"  {count:6d}  {name}")
    print(f"to keep: {len(kept)}")
    for name, count in collections.Counter(kind(k["PK"]) for k in kept).most_common(10):
        print(f"  {count:6d}  {name}")
    minutes = len(doomed) / args.wcu / 60
    if not args.apply:
        print(f"dry run — nothing deleted (an --apply run takes about {minutes:.0f} min)")
        return

    delete(session.client("dynamodb"), table_name, doomed, args.wcu)
    purge_dlqs(session.client("sqs"))
    print("reset done")


if __name__ == "__main__":
    main()
