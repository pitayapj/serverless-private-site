import { Construct } from "constructs";
import {
    aws_certificatemanager as certificatemanager,
    aws_elasticloadbalancingv2 as lbv2,
    aws_ec2 as ec2,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as cloudfront_origins,
    aws_route53 as route53,
    aws_route53_targets as route53_targets,
    Duration
} from 'aws-cdk-lib';
import { DeployEnvEnum, commonConstants } from "../../parameters";

interface CloudfrontLoadBalancerConstructProps {
    deployEnv: DeployEnvEnum
    hostZone: route53.HostedZone
    lbCert: certificatemanager.Certificate
    cloudfrontCert: certificatemanager.Certificate
    vpc: ec2.Vpc
    loggingBucket: s3.Bucket
    supportBackendDomains: string[]
}

export class CloudfrontLoadBalancerConstruct extends Construct {
    public readonly loadBalancer: lbv2.ApplicationLoadBalancer
    public readonly httpsListener: lbv2.ApplicationListener
    constructor(scope: Construct, id: string, props: CloudfrontLoadBalancerConstructProps) {
        super(scope, id);

        const { deployEnv, hostZone, cloudfrontCert, lbCert, vpc, loggingBucket, supportBackendDomains } = props

        /**
         * Load balancer
         */
        const lbSecurityGroup = new ec2.SecurityGroup(this, `${deployEnv}-${commonConstants.project}-lb-security-group`, {
            vpc: vpc,
            allowAllOutbound: true,
        });
        lbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow inbound traffic on port 80");
        lbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "Allow inbound traffic on port 443");

        this.loadBalancer = new lbv2.ApplicationLoadBalancer(this, `${deployEnv}-${commonConstants.project}-lb`, {
            loadBalancerName: `${deployEnv}-${commonConstants.project}-lb`,
            vpc: vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
            internetFacing: true,
            securityGroup: lbSecurityGroup,
        });
        this.loadBalancer.logAccessLogs(loggingBucket, `this.loadBalancer/${deployEnv}`);

        //default listener and rule
        this.loadBalancer.addListener("listenerHttp", {
            port: 80,
            defaultAction: lbv2.ListenerAction.redirect({ port: "443", protocol: lbv2.ApplicationProtocol.HTTPS })
        });

        this.httpsListener = this.loadBalancer.addListener("listenerHttps", {
            port: 443,
            protocol: lbv2.ApplicationProtocol.HTTPS,
            certificates: [lbCert],
            defaultAction: lbv2.ListenerAction.fixedResponse(404, {
                contentType: "text/html",
                messageBody: "お指定URLをご確認ください！"
            }),
            sslPolicy: lbv2.SslPolicy.TLS12
        });

        /**
         * Optional Cloudfront
         */
        const originResponsePolicy = new cloudfront.ResponseHeadersPolicy(this, `cloudfront-backend-response-policy-${deployEnv}`, {
            responseHeadersPolicyName: `cloudfront-backend-response-policy-${deployEnv}`,
            corsBehavior: {
                accessControlAllowCredentials: false,
                accessControlAllowHeaders: ['Authorization', '*'], // * alone does NOT include Authorization header. Need to write it specifically
                accessControlAllowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'HEAD'],
                accessControlAllowOrigins: [`*`],
                // accessControlExposeHeaders: [],
                accessControlMaxAge: Duration.seconds(600),
                originOverride: true,
            }
        });
        const ecsServiceCloudfront = new cloudfront.Distribution(this, `ecs-service-cloudfront-${deployEnv}`, {
            defaultRootObject: 'index.html',
            defaultBehavior: {
                origin: new cloudfront_origins.LoadBalancerV2Origin(this.loadBalancer, {
                    // To make sure request is coming from our Distribution, we may add this custom header to Cloudfront and LoadBalancer
                    // customHeaders: {
                    //   "X-Custom-Header": commonConstants.project
                    // }
                }),
                originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_AND_CLOUDFRONT_2022,
                responseHeadersPolicy: originResponsePolicy,
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            },
            enableLogging: true,
            logBucket: loggingBucket,
            logFilePrefix: `cloudfront/${deployEnv}/`,
            certificate: cloudfrontCert,
            domainNames: supportBackendDomains,
            priceClass: cloudfront.PriceClass.PRICE_CLASS_200, //include Japan but not all
            // Custom for Frontend Distribution
            // If frontend is a React SPA app hosting in S3, we will needed in including below code (to change behavior when user reload page)
            // In case of when frontend's pages have .html in the end (Ex: using NextJS), we need to include cloudfront-fix.mjs in assets folder
            // errorResponses: [
            //   {
            //     httpStatus: 404,
            //     responseHttpStatus: 200,
            //     responsePagePath: "/index.html",
            //     ttl: Duration.seconds(0),
            //   }
            // ]
        });

        supportBackendDomains.forEach ((domain, key) => {
            new route53.ARecord(this, `service-${key}-${deployEnv}`, {
                zone: hostZone,
                target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(ecsServiceCloudfront)),
                // target: route53.RecordTarget.fromAlias(new route53_targets.LoadBalancerTarget(this.loadBalancer)), //if no cloudfront
                recordName: domain,
            });
        })
    }
}
