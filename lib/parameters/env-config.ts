import * as dotenv from 'dotenv';
import * as path from 'path';

//Define each parameters' type
export interface CDKConfig {
    awsAccount: string,
    githubConnection: string,
    region: string,
    infraRepo: string,
}

//Get parameter from .env file, if value not exist, get default's value

export const resolveConfig = (): CDKConfig => {
    dotenv.config({ path: path.resolve(__dirname, '../../.env') });

    return {
        awsAccount: process.env.ACCOUNT_ID || '',
        githubConnection: process.env.CONNECTION_ARN || '',
        region: process.env.REGION || 'ap-northeast-1',
        infraRepo: process.env.INFRA_REPOSITORY || 'pitayapj/pitaya-cdk-template',
    }
};
