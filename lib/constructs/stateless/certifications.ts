import { Construct } from "constructs";
import {
  aws_certificatemanager as certificatemanager,
  aws_route53 as route53,
} from 'aws-cdk-lib';
import { DeployEnvEnum, envConstants, commonConstants } from "../../parameters";

interface CertificatesConstructProps {
  deployEnv: DeployEnvEnum
  hostZone: route53.HostedZone
}

export class CertificatesConstruct extends Construct {
  public readonly lbCert: certificatemanager.Certificate
  public readonly cloudfrontCert: certificatemanager.DnsValidatedCertificate
  constructor(scope: Construct, id: string, props: CertificatesConstructProps) {
    super(scope, id);

    const { deployEnv, hostZone } = props
    
    /**
     * Certs 
     * There is no real good way to get certificate for Cloudfront. See more -> https://github.com/aws/aws-cdk/discussions/23931
     * So, we gonna create it with a deprecated function.
     */
    this.lbCert = new certificatemanager.Certificate(this, `${deployEnv}-${commonConstants.project}-cert`, {
        domainName: envConstants[deployEnv].domain,
        subjectAlternativeNames: [`*.${envConstants[deployEnv].domain}`],
        validation: certificatemanager.CertificateValidation.fromDns(hostZone),
    });

    this.cloudfrontCert = new certificatemanager.DnsValidatedCertificate(this, `${deployEnv}-${commonConstants.project}-cloudfront-cert`, {
        domainName: envConstants[deployEnv].domain,
        subjectAlternativeNames: [`api.${envConstants[deployEnv].domain}`],
        hostedZone: hostZone,
        // the properties below are set for validation in us-east-1
        region: 'us-east-1',
        validation: certificatemanager.CertificateValidation.fromDns(hostZone),
    });
  }
}
