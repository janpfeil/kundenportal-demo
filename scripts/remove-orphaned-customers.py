"""Removes the data of portal customers whose sign-in identity no longer exists (owner tenant).

E2E runs delete their Cognito users at the end, but every domain keeps the customer's data
(profile, contracts, readings, documents, mailbox, directory entries); migration journeys
that took over the same legacy account several times also escape the demo reset, which
only knows the last identity per legacy account. This script finds every customer link
(`TENANT#owner#SUBJ#<sub>` / `CUSTOMER`) whose subject is not in the user pool and
announces the identities in `MigratedAccountsRemoved` — the event the demo reset uses —
so each domain deletes its own data. Small batches, spaced, so the deletes stay within
the table's 5 write units.

    AWS_PROFILE=kundenportal python3 scripts/remove-orphaned-customers.py          # dry run
    AWS_PROFILE=kundenportal python3 scripts/remove-orphaned-customers.py --apply  # remove

Needs boto3. Reads the table name and user pool from the SSM parameters.
"""
import argparse
import collections
import datetime
import json
import time
import uuid

import boto3

TENANT = "owner"
BUS = "kundenportal"  # fixed name of the own event bus (infra/cdk/lib/events.ts)
PARAMS = {
    "table": "/kundenportal/base/table-name",
    "pool": "/kundenportal/base/user-pool-id",
}


def parameter(ssm, name):
    return ssm.get_parameter(Name=name)["Parameter"]["Value"]


def pool_subjects(idp, pool):
    subjects, kwargs = set(), {"UserPoolId": pool, "AttributesToGet": ["sub"]}
    while True:
        page = idp.list_users(**kwargs)
        for user in page["Users"]:
            subjects.update(a["Value"] for a in user["Attributes"] if a["Name"] == "sub")
        if "PaginationToken" not in page:
            return subjects
        kwargs["PaginationToken"] = page["PaginationToken"]


def customer_links(table):
    """Every customer link of the tenant, by a paced Scan (100 items a page, 1 s apart)."""
    links, kwargs = {}, {
        "Limit": 100,
        "FilterExpression": "begins_with(PK, :p) AND SK = :sk",
        "ExpressionAttributeValues": {":p": f"TENANT#{TENANT}#SUBJ#", ":sk": "CUSTOMER"},
    }
    while True:
        page = table.scan(**kwargs)
        for item in page["Items"]:
            links[item["PK"].rsplit("#", 1)[-1]] = item["customerId"]
        if "LastEvaluatedKey" not in page:
            return links
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="publish the removals (default: dry run)")
    parser.add_argument("--batch", type=int, default=2, help="identities per event (default 2)")
    parser.add_argument("--pause", type=float, default=15, help="seconds between events (default 15)")
    parser.add_argument("--limit", type=int, help="only the first N orphaned identities (a trial)")
    args = parser.parse_args()

    session = boto3.Session(region_name="eu-central-1")
    ssm = session.client("ssm")
    names = {key: parameter(ssm, name) for key, name in PARAMS.items()}
    table = session.resource("dynamodb").Table(names["table"])
    live = pool_subjects(session.client("cognito-idp"), names["pool"])
    links = customer_links(table)
    orphans = [(sub, cid) for sub, cid in sorted(links.items()) if sub not in live]
    live_customers = {cid for sub, cid in links.items() if sub in live}
    # Never a customer a living identity still points to (e.g. after account linking).
    orphans = [(sub, cid) for sub, cid in orphans if cid not in live_customers]
    if args.limit is not None:
        orphans = orphans[:args.limit]

    origins = collections.Counter()
    for _, cid in orphans:
        profile = table.get_item(
            Key={"PK": f"TENANT#{TENANT}#CUST#{cid}", "SK": "PROFILE"},
            ProjectionExpression="origin, email",
        ).get("Item", {})
        origins[(profile.get("origin", "no profile"), profile.get("email", "@").split("@")[-1])] += 1
    print(f"identities in the pool: {len(live)}, customer links: {len(links)}, orphaned: {len(orphans)}")
    for (origin, domain), count in origins.most_common():
        print(f"  {count:5d}  {origin}  @{domain}")
    if not args.apply or not orphans:
        print("dry run — nothing published" if not args.apply else "nothing to remove")
        return

    events = session.client("events")
    correlation = f"remove-orphaned-customers-{datetime.date.today().isoformat()}"
    batches = [orphans[i:i + args.batch] for i in range(0, len(orphans), args.batch)]
    for n, batch in enumerate(batches, 1):
        detail = {
            "eventId": str(uuid.uuid4()),
            "tenantId": TENANT,
            "occurredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds"),
            "correlationId": correlation,
            "payload": {
                "reason": "demo-reset",
                "accounts": [{"subject": sub, "customerId": cid} for sub, cid in batch],
            },
        }
        result = events.put_events(Entries=[{
            "EventBusName": BUS,
            "Source": "kundenportal.migration",
            "DetailType": "MigratedAccountsRemoved",
            "Detail": json.dumps(detail),
        }])
        if result["FailedEntryCount"]:
            raise SystemExit(f"EventBridge rejected batch {n}: {result['Entries']}")
        print(f"{n}/{len(batches)} published ({len(batch)} identities)", flush=True)
        if n < len(batches):
            time.sleep(args.pause)


if __name__ == "__main__":
    main()
