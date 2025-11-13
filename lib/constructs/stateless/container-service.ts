import { Construct } from "constructs";
import {
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_iam as iam,
  aws_elasticloadbalancingv2 as lbv2,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as cloudfront_origins,
  aws_route53 as route53,
  aws_route53_targets as route53_targets,
  Duration,
} from 'aws-cdk-lib';
import { DeployEnvEnum, envConstants  } from "../../parameters";

interface ContainerServiceConstructProps {
  deployEnv: DeployEnvEnum
  cluster: ecs.Cluster,
  vpc: ec2.Vpc,
  loadBalancer: lbv2.ApplicationLoadBalancer,
  httpsListener: lbv2.ApplicationListener,
  albPriority: number,
  serviceName: string,
  serviceDomain: string,
  port: number,
  customPolicies: iam.PolicyStatement[],
  healthCheckPath: string,
  secrets?: { [key: string]: ecs.Secret },
}

// Wrap ECR Repo and ECS Task Definition for API Service
// All service will be using ECS as compute service
export class ContainerServiceConstruct extends Construct {
  public readonly ecrRepo: ecr.Repository
  public readonly ecrService: ecs.FargateService
  constructor(scope: Construct, id: string, props: ContainerServiceConstructProps) {
    super(scope, id);

    const { 
      deployEnv, 
      cluster, 
      vpc, 
      loadBalancer,
      httpsListener, 
      albPriority,
      serviceName, 
      serviceDomain,
      port, 
      customPolicies, 
      healthCheckPath,
      secrets,
     } = props
    
    //Image Repo
    this.ecrRepo = new ecr.Repository(this, `${deployEnv}-${serviceName}-ecr-repo`, {
      repositoryName: `${deployEnv}-${serviceName}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    //Task Definition

    const containerName = `${serviceName}-container`;
    const taskDef = new ecs.FargateTaskDefinition(this, `${deployEnv}-${serviceName}-task-def`);
    const taskDefLogGroup = new logs.LogGroup(this, `${deployEnv}-${serviceName}-logGroup`, { 
      logGroupName: `/${deployEnv}/ecs/${serviceName}`, 
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.SIX_MONTHS,
    });

    taskDef.addContainer(containerName, {
      image: ecs.ContainerImage.fromEcrRepository(this.ecrRepo),
      portMappings: [
        {
          containerPort: port,
        },
      ],
      secrets: secrets,
      environment: {
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${deployEnv}`, logGroup: taskDefLogGroup }),
    });
    customPolicies.forEach((policy) => {
      taskDef.addToTaskRolePolicy(policy);
    });


    //Service
    this.ecrService = new ecs.FargateService(this, `${deployEnv}-${serviceName}-service`, {
      cluster: cluster,
      taskDefinition: taskDef,
      serviceName: `${serviceName}-service`,
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      deploymentStrategy: ecs.DeploymentStrategy.BLUE_GREEN,
      desiredCount: 1,
      maxHealthyPercent: 200,
      minHealthyPercent: 100,
      assignPublicIp: true, //if not set, task will be place in private subnet
    });

    const blueTarget = new lbv2.ApplicationTargetGroup(this, `${serviceName}-blue-target-group-${deployEnv}`, {
      vpc: vpc,
      port: port,
      protocol: lbv2.ApplicationProtocol.HTTP,
      targetType: lbv2.TargetType.IP,
      healthCheck: {
        path: healthCheckPath // This is the path to check if api service is healthy create small page to fast check
      },
    });

    const greenTarget = new lbv2.ApplicationTargetGroup(this, `${serviceName}-green-target-group-${deployEnv}`, {
      vpc: vpc,
      port: port,
      protocol: lbv2.ApplicationProtocol.HTTP,
      targetType: lbv2.TargetType.IP,
      healthCheck: {
        path: healthCheckPath // This is the path to check if api service is healthy create small page to fast check
      },
    });

    const serviceRule = new lbv2.ApplicationListenerRule(this, `${serviceName}-rule-${deployEnv}`, {
      listener: httpsListener,
      priority: albPriority,
      conditions: [
        lbv2.ListenerCondition.hostHeaders([serviceDomain]),
      ],
      targetGroups: [blueTarget, greenTarget]
    });

    serviceRule.configureAction(
      lbv2.ListenerAction.weightedForward([
        {
          targetGroup: blueTarget,
          weight: 1
        },
        {
          targetGroup: greenTarget,
          weight: 0
        },
      ])
    );

    const target = this.ecrService.loadBalancerTarget({
      containerName: containerName,
      containerPort: 80,
      alternateTarget: new ecs.AlternateTarget('alternate-green-target', {
        alternateTargetGroup: greenTarget,
        productionListener: ecs.ListenerRuleConfiguration.applicationListenerRule(serviceRule),
      }),
    });
  }
}
