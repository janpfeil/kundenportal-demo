import { Stack, type StackProps } from "aws-cdk-lib";
import {
  Certificate,
  CertificateValidation,
  type ICertificate,
} from "aws-cdk-lib/aws-certificatemanager";
import type { Construct } from "constructs";

/**
 * TLS certificate for CloudFront, which only accepts certificates from us-east-1.
 * DNS validation without Route 53: CloudFormation waits until the owner has added the
 * validation CNAME at the own name server (see docs/wiki/anleitung-kontoinhaber.md).
 */
export class CertificateStack extends Stack {
  readonly certificate: ICertificate;

  constructor(scope: Construct, id: string, props: StackProps & { domainName: string }) {
    super(scope, id, props);
    this.certificate = new Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: CertificateValidation.fromDns(),
    });
  }
}
