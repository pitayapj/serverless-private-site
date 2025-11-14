import { Construct } from "constructs";
import {
  Duration,
  aws_s3 as s3,
  aws_certificatemanager as certificatemanager,
  aws_route53 as route53,
  aws_route53_targets as route53_targets,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as cloudfront_origins,
  aws_lambda as lambda,
} from 'aws-cdk-lib';
import { envConstants, DeployEnvEnum } from '../../../parameters'

interface FrontendConstructProps {
  deployEnv: DeployEnvEnum,
  hostedZone: route53.HostedZone,
  frontendBucket: s3.Bucket,
  loggingBucket: s3.Bucket,
  frontendOai: cloudfront.OriginAccessIdentity,
  parseAuthLambdaArn: string,
  refreshAuthLambdaArn: string,
  signOutLambdaArn: string,
  checkAuthLambdaArn: string,
  httpHeadersLambdaArn: string,
}

export class FrontendConstruct extends Construct {
  public readonly distribution: cloudfront.Distribution
  constructor(scope: Construct, id: string, props: FrontendConstructProps) {
    super(scope, id);

    const { deployEnv, hostedZone, loggingBucket, frontendBucket, frontendOai, parseAuthLambdaArn, refreshAuthLambdaArn, signOutLambdaArn, checkAuthLambdaArn, httpHeadersLambdaArn } = props
    const frontendDomain = envConstants[deployEnv].domain

    const certificate = new certificatemanager.DnsValidatedCertificate(this, 'cloudfront-cert', {
      domainName: frontendDomain,
      subjectAlternativeNames: [`*.${frontendDomain}`],
      hostedZone: hostedZone,
      region: 'us-east-1',
      validation: certificatemanager.CertificateValidation.fromDns(hostedZone),
    });

    const dummyOrigin = new cloudfront_origins.HttpOrigin("dummy-origin.com");

    const legacyEquivalentPolicy = new cloudfront.CachePolicy(this, 'legacy-equivalent-policy', {
      cachePolicyName: `UseOriginCacheHeaders_AllQueryStrings${deployEnv}`,
      comment: 'Equivalent of legacy: headers none, query all, cookies none, use origin cache headers',
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.all(),

      // 👇 Tell CloudFront to honor origin's Cache-Control / Expires headers
      defaultTtl: Duration.days(1), // fallback if origin doesn’t send caching headers
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    this.distribution = new cloudfront.Distribution(this, 'frontend-distribution', {
      defaultRootObject: 'index.html',
      comment: `荒尾監視フロントエンド（${deployEnv}）`,
      defaultBehavior: {
        origin: cloudfront_origins.S3BucketOrigin.withOriginAccessIdentity(frontendBucket, {
          originAccessIdentity: frontendOai
        }),
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: legacyEquivalentPolicy,
        edgeLambdas: [
          {
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
            functionVersion: lambda.Version.fromVersionArn(this, 'checkauth-lambda-version', checkAuthLambdaArn),
          },
          {
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
            functionVersion: lambda.Version.fromVersionArn(this, 'http-headers-lambda-version', httpHeadersLambdaArn),
          }
        ]
      },
      additionalBehaviors:{
        "/parseauth": {
          origin: dummyOrigin,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          edgeLambdas: [
            {
              eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
              functionVersion: lambda.Version.fromVersionArn(this, 'parseauth-lambda-version', parseAuthLambdaArn),
            }
          ] 
        },
        "/refreshauth": {
          origin: dummyOrigin,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          edgeLambdas: [
            {
              eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
              functionVersion: lambda.Version.fromVersionArn(this, 'refreshauth-lambda-version', refreshAuthLambdaArn),
            }
          ]
        },
        "/signout": {
          origin: dummyOrigin,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          edgeLambdas: [
            {
              eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
              functionVersion: lambda.Version.fromVersionArn(this, 'signout-lambda-version', signOutLambdaArn),
            }
          ]
        },
      },
      enableLogging: true,
      logBucket: loggingBucket,
      logFilePrefix: `${deployEnv}/cloudfront-frontend/`,
      certificate: certificate,
      domainNames: [frontendDomain],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200, //include Japan but not all
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.seconds(0),
        }
      ]
    });

    new route53.ARecord(this, 'distribution-alias-A-record', {
      zone: hostedZone,
      recordName: frontendDomain,
      target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(this.distribution)),
    });
  }
}
