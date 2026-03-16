# Secure Guide

## 개요

이 장에서는 Sentinel Share 공격 시나리오 테스트를 위한 보안 양호 환경(`secure`)을 구축한다.  
문서의 목표는 네트워크, IAM, ECR, RDS, S3, ECS Fargate까지 이어지는 전체 실습 흐름을 콘솔과 CLI 기준으로 함께 따라갈 수 있도록 정리하는 것이다.

이 문서는 아래 명칭 규칙과 사용자 지정 이름을 우선 적용했다.  
이름은 임의로 바꾸지 않고, 요청한 항목에 해당하는 곳에만 반영했다.

---

## 적용한 명칭

### VPC / Network

- VPC: `secure-vpc`
- Public subnet: `secure-subnet-public`
- Private subnet: `secure-subnet-private`
- Internet Gateway: `secure-igw`
- NAT Gateway: `secure-nat`
- Public route table: `secure-rt-public`
- Private route table: `secure-rt-private`

### IAM / ECR

- ECS Task execution role: `s3cure-taskexecutionrole`
- ECS Task role: `s3cure-taskrole`
- ECR private repository: `s3cure-api`

### RDS / Security Group

- DB subnet group: `secure-db-subnet-group`
- DB instance: `secure-db`
- Bastion EC2: `secure-bastionecs`
- Container SG: `secure-container-sg`
- Bastion SG: `secure-bastion-sg`
- RDS SG: `secure-rds-sg`

### ECS / Logs

- ECS cluster: `secure-cluster`
- ECS task definition: `secure-task`
- ECS service: `secure-service`
- Container name: `secure-container`
- CloudWatch log group: `/ecs/secure-task`

### S3

- Log bucket: `secure-log`

---

## 중요한 보정 사항

1. 사용자 메모 기준 네트워크 이름은 `secure-subnet-private` 1개지만, 실제 AWS RDS 생성 시 DB subnet group에서 서로 다른 AZ의 subnet 2개 이상을 요구할 수 있다.  
   따라서 문서에서는 기본 이름은 `secure-subnet-private`로 유지하고, RDS 생성 단계에서 필요 시 보조 subnet을 추가하는 방식으로 설명한다.

2. 현재 저장소의 백엔드 코드는 포트 `3000`을 사용한다.  
   따라서 보안 그룹과 ECS container port는 메모의 `5000` 대신 `3000`으로 맞춘다.

3. 현재 저장소의 애플리케이션은 `sentinelshare/...` 형식의 Secrets Manager 값을 사용하도록 예시가 작성되어 있다.  
   따라서 secret 이름은 코드 호환성을 우선하는 방식으로 유지했다.

---

## Step 0. 사전 준비

### 콘솔에서 하는 방법

1. AWS 콘솔에서 CLI용 IAM 사용자 또는 사용할 IAM 사용자를 준비한다.
2. `IAM -> Users -> [사용자] -> Security credentials -> Create access key`로 액세스 키를 만든다.
3. 로컬 PC에 AWS CLI를 설치한다.
4. 터미널에서 `aws configure`를 실행해 Access Key와 Secret Key를 입력한다.
5. `aws sts get-caller-identity`로 로그인 계정이 맞는지 확인한다.

### CLI

```bash
aws configure
aws sts get-caller-identity

AWS_REGION=ap-northeast-2
AWS_AZ=ap-northeast-2a
AWS_ACCOUNT_ID=<YOUR_ACCOUNT_ID>
MY_IP=<YOUR_PUBLIC_IP>/32

VPC_NAME=secure-vpc
VPC_CIDR=10.2.0.0/16

PUBLIC_SUBNET_NAME=secure-subnet-public
PUBLIC_SUBNET_CIDR=10.2.1.0/24

PRIVATE_SUBNET_NAME=secure-subnet-private
PRIVATE_SUBNET_CIDR=10.2.101.0/24

IGW_NAME=secure-igw
NAT_NAME=secure-nat
PUBLIC_RT_NAME=secure-rt-public
PRIVATE_RT_NAME=secure-rt-private

TASK_EXEC_ROLE=s3cure-taskexecutionrole
TASK_ROLE=s3cure-taskrole
ECR_REPO=s3cure-api

CLUSTER_NAME=secure-cluster
TASK_FAMILY=secure-task
SERVICE_NAME=secure-service
CONTAINER_NAME=secure-container

DB_SUBNET_GROUP=secure-db-subnet-group
DB_IDENTIFIER=secure-db
DB_NAME=sentinelshare
DB_USER=secureadmin
DB_PASSWORD='<STRONG_DB_PASSWORD>'

APP_BUCKET=secure-files-private
LOG_BUCKET=secure-log
LOG_GROUP=/ecs/secure-task
```

---

## Step 1. VPC 생성

### 콘솔에서 하는 방법

1. `VPC -> Your VPCs -> Create VPC`
2. 이름을 `secure-vpc`로 입력
3. IPv4 CIDR을 `10.2.0.0/16`로 입력
4. 생성 후 DNS hostnames, DNS resolution이 켜져 있는지 확인

### CLI

```bash
VPC_ID=$(aws ec2 create-vpc \
  --region $AWS_REGION \
  --cidr-block $VPC_CIDR \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=$VPC_NAME}]" \
  --query 'Vpc.VpcId' \
  --output text)

aws ec2 modify-vpc-attribute \
  --region $AWS_REGION \
  --vpc-id $VPC_ID \
  --enable-dns-support

aws ec2 modify-vpc-attribute \
  --region $AWS_REGION \
  --vpc-id $VPC_ID \
  --enable-dns-hostnames
```

---

## Step 2. 퍼블릭 서브넷 생성

### 콘솔에서 하는 방법

1. `VPC -> Subnets -> Create subnet`
2. VPC는 `secure-vpc` 선택
3. 이름은 `secure-subnet-public`
4. 가용 영역은 `ap-northeast-2a`
5. IPv4 CIDR은 `10.2.1.0/24`
6. 생성 후 `Edit subnet settings`에서 `Auto-assign public IPv4 address` 활성화

### CLI

```bash
PUBLIC_SUBNET_ID=$(aws ec2 create-subnet \
  --region $AWS_REGION \
  --vpc-id $VPC_ID \
  --cidr-block $PUBLIC_SUBNET_CIDR \
  --availability-zone $AWS_AZ \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$PUBLIC_SUBNET_NAME}]" \
  --query 'Subnet.SubnetId' \
  --output text)

aws ec2 modify-subnet-attribute \
  --region $AWS_REGION \
  --subnet-id $PUBLIC_SUBNET_ID \
  --map-public-ip-on-launch
```

---

## Step 3. 프라이빗 서브넷 생성

### 콘솔에서 하는 방법

1. `VPC -> Subnets -> Create subnet`
2. VPC는 `secure-vpc` 선택
3. 이름은 `secure-subnet-private`
4. 가용 영역은 `ap-northeast-2a`
5. IPv4 CIDR은 `10.2.101.0/24`

### CLI

```bash
PRIVATE_SUBNET_ID=$(aws ec2 create-subnet \
  --region $AWS_REGION \
  --vpc-id $VPC_ID \
  --cidr-block $PRIVATE_SUBNET_CIDR \
  --availability-zone $AWS_AZ \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$PRIVATE_SUBNET_NAME}]" \
  --query 'Subnet.SubnetId' \
  --output text)
```

### 메모

RDS 생성 시 AWS가 DB subnet group에 다른 AZ의 subnet을 요구하면 보조 private subnet 하나를 추가해야 한다.  
그 경우 추천 이름은 `secure-subnet-private-2c`, CIDR은 `10.2.102.0/24`, AZ는 `ap-northeast-2c`다.  
기본 명칭인 `secure-subnet-private`는 그대로 유지한다.

---

## Step 4. 인터넷 게이트웨이 생성 및 연결

### 콘솔에서 하는 방법

1. `VPC -> Internet gateways -> Create internet gateway`
2. 이름은 `secure-igw`
3. 생성 후 `Attach to VPC`
4. 연결 대상은 `secure-vpc`

### CLI

```bash
IGW_ID=$(aws ec2 create-internet-gateway \
  --region $AWS_REGION \
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=$IGW_NAME}]" \
  --query 'InternetGateway.InternetGatewayId' \
  --output text)

aws ec2 attach-internet-gateway \
  --region $AWS_REGION \
  --internet-gateway-id $IGW_ID \
  --vpc-id $VPC_ID
```

---

## Step 5. NAT Gateway 생성

### 콘솔에서 하는 방법

1. `VPC -> NAT gateways -> Create NAT gateway`
2. 이름은 `secure-nat`
3. Subnet은 `secure-subnet-public`
4. Elastic IP는 새로 할당
5. 생성 후 상태가 `Available`이 될 때까지 대기

### CLI

```bash
EIP_ALLOC_ID=$(aws ec2 allocate-address \
  --region $AWS_REGION \
  --domain vpc \
  --query 'AllocationId' \
  --output text)

NAT_GW_ID=$(aws ec2 create-nat-gateway \
  --region $AWS_REGION \
  --subnet-id $PUBLIC_SUBNET_ID \
  --allocation-id $EIP_ALLOC_ID \
  --tag-specifications "ResourceType=natgateway,Tags=[{Key=Name,Value=$NAT_NAME}]" \
  --query 'NatGateway.NatGatewayId' \
  --output text)

aws ec2 wait nat-gateway-available \
  --region $AWS_REGION \
  --nat-gateway-ids $NAT_GW_ID
```

---

## Step 6. 퍼블릭 라우트 테이블 생성

### 콘솔에서 하는 방법

1. `VPC -> Route tables -> Create route table`
2. 이름은 `secure-rt-public`
3. VPC는 `secure-vpc`
4. 생성 후 `Routes -> Edit routes`
5. `0.0.0.0/0 -> secure-igw` 추가
6. `Subnet associations`에서 `secure-subnet-public` 연결

### CLI

```bash
PUBLIC_RT_ID=$(aws ec2 create-route-table \
  --region $AWS_REGION \
  --vpc-id $VPC_ID \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=$PUBLIC_RT_NAME}]" \
  --query 'RouteTable.RouteTableId' \
  --output text)

aws ec2 create-route \
  --region $AWS_REGION \
  --route-table-id $PUBLIC_RT_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id $IGW_ID

aws ec2 associate-route-table \
  --region $AWS_REGION \
  --route-table-id $PUBLIC_RT_ID \
  --subnet-id $PUBLIC_SUBNET_ID
```

---

## Step 7. 프라이빗 라우트 테이블 생성

### 콘솔에서 하는 방법

1. `VPC -> Route tables -> Create route table`
2. 이름은 `secure-rt-private`
3. VPC는 `secure-vpc`
4. 생성 후 `Routes -> Edit routes`
5. `0.0.0.0/0 -> secure-nat` 추가
6. `Subnet associations`에서 `secure-subnet-private` 연결

### CLI

```bash
PRIVATE_RT_ID=$(aws ec2 create-route-table \
  --region $AWS_REGION \
  --vpc-id $VPC_ID \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=$PRIVATE_RT_NAME}]" \
  --query 'RouteTable.RouteTableId' \
  --output text)

aws ec2 create-route \
  --region $AWS_REGION \
  --route-table-id $PRIVATE_RT_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id $NAT_GW_ID

aws ec2 associate-route-table \
  --region $AWS_REGION \
  --route-table-id $PRIVATE_RT_ID \
  --subnet-id $PRIVATE_SUBNET_ID
```

---

## Step 8. 보안 그룹 생성

### 콘솔에서 하는 방법

1. `EC2 -> Security Groups -> Create security group`
2. Container SG 생성
   이름: `secure-container-sg`
   VPC: `secure-vpc`
   인바운드: Custom TCP, `3000`, 소스 `10.1.0.0/16`
3. Bastion SG 생성
   이름: `secure-bastion-sg`
   VPC: `secure-vpc`
   인바운드: SSH, `22`, `내 IP/32`
4. RDS SG 생성
   이름: `secure-rds-sg`
   VPC: `secure-vpc`
   인바운드:
   PostgreSQL `5432` from `secure-container-sg`
   PostgreSQL `5432` from `secure-bastion-sg`

### CLI

```bash
CONTAINER_SG_ID=$(aws ec2 create-security-group \
  --region $AWS_REGION \
  --group-name secure-container-sg \
  --description "secure container sg" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text)

aws ec2 authorize-security-group-ingress \
  --region $AWS_REGION \
  --group-id $CONTAINER_SG_ID \
  --ip-permissions '[{"IpProtocol":"tcp","FromPort":3000,"ToPort":3000,"IpRanges":[{"CidrIp":"10.1.0.0/16"}]}]'

BASTION_SG_ID=$(aws ec2 create-security-group \
  --region $AWS_REGION \
  --group-name secure-bastion-sg \
  --description "secure bastion sg" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text)

aws ec2 authorize-security-group-ingress \
  --region $AWS_REGION \
  --group-id $BASTION_SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr $MY_IP

RDS_SG_ID=$(aws ec2 create-security-group \
  --region $AWS_REGION \
  --group-name secure-rds-sg \
  --description "secure rds sg" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text)

aws ec2 authorize-security-group-ingress \
  --region $AWS_REGION \
  --group-id $RDS_SG_ID \
  --ip-permissions "[{\"IpProtocol\":\"tcp\",\"FromPort\":5432,\"ToPort\":5432,\"UserIdGroupPairs\":[{\"GroupId\":\"$CONTAINER_SG_ID\"},{\"GroupId\":\"$BASTION_SG_ID\"}]}]"
```

### 메모

사용자 메모에는 `5000`이 있었지만, 현재 저장소의 백엔드 포트는 `3000`이라 그에 맞췄다.
또한 `보안 양호` 환경 기준으로 `0.0.0.0/0` 공개 대신 `10.1.0.0/16`에서만 접근하도록 제한했다.
나중에 ALB를 붙일 경우에는 `10.1.0.0/16` 대신 ALB 보안 그룹만 허용하도록 더 좁히는 것이 좋다.

---

## Step 9. IAM Role 생성

### 콘솔에서 하는 방법

1. `IAM -> Roles -> Create role`
2. Trusted entity는 `AWS service`
3. Use case는 `Elastic Container Service Task`
4. Execution role 이름은 `s3cure-taskexecutionrole`
5. 정책은 `AmazonECSTaskExecutionRolePolicy` 연결
6. Task role 이름은 `s3cure-taskrole`
7. Task role에는 관리형 전체 권한 대신 인라인 최소 권한 정책 연결
8. S3는 애플리케이션 버킷의 필요한 경로만 허용
9. DynamoDB는 실제 사용하는 경우에만 `권한 추가 -> 인라인 정책 생성 -> JSON`으로 이동
10. 아래 정책에서 `YOUR_ACCOUNT_ID`와 실제 테이블 이름을 바꾼 뒤 정책 이름을 `s3cure-taskrole-dynamodb`로 저장
11. 이후 `s3cure-taskexecutionrole`에 Secrets Manager 접근용 인라인 정책 추가

### Trust policy 파일

파일명: `ecs-task-trust-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### Task role 인라인 정책 파일

파일명 `s3cure-taskrole-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAppBucketObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::secure-files-private/uploads/*"
    },
    {
      "Sid": "AllowAppBucketList",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::secure-files-private"
    }
  ]
}
```

### Task role DynamoDB 인라인 정책 파일

파일명 `s3cure-taskrole-dynamodb-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSpecificDynamoDBTable",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-northeast-2:YOUR_ACCOUNT_ID:table/secure-files-metadata"
      ]
    }
  ]
}
```

### Execution role secret 조회 정책 파일

파일명 `s3cure-taskexecution-secrets-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/*"
      ]
    }
  ]
}
```

### CLI

```bash
aws iam create-role \
  --role-name $TASK_EXEC_ROLE \
  --assume-role-policy-document file://ecs-task-trust-policy.json

aws iam attach-role-policy \
  --role-name $TASK_EXEC_ROLE \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam put-role-policy \
  --role-name $TASK_EXEC_ROLE \
  --policy-name s3cure-taskexecution-secrets \
  --policy-document file://s3cure-taskexecution-secrets-policy.json

aws iam create-role \
  --role-name $TASK_ROLE \
  --assume-role-policy-document file://ecs-task-trust-policy.json

aws iam put-role-policy \
  --role-name $TASK_ROLE \
  --policy-name s3cure-taskrole-inline \
  --policy-document file://s3cure-taskrole-policy.json

# DynamoDB를 실제 사용하는 경우에만 추가
aws iam put-role-policy \
  --role-name $TASK_ROLE \
  --policy-name s3cure-taskrole-dynamodb \
  --policy-document file://s3cure-taskrole-dynamodb-policy.json
```

---

## Step 10. ECR 생성 및 Docker 이미지 Push 테스트

### 콘솔에서 하는 방법

1. `ECR -> Private repositories -> Create repository`
2. 이름은 `s3cure-api`
3. Visibility는 `Private`
4. Immutable tags는 비활성화
5. Scan on push는 활성화
6. 생성 후 `View push commands`를 참고해 이미지 업로드

### CLI

```bash
aws ecr create-repository \
  --region $AWS_REGION \
  --repository-name $ECR_REPO \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability MUTABLE

aws ecr get-login-password --region $AWS_REGION | \
docker login --username AWS --password-stdin \
${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

docker build -t ${ECR_REPO}:latest ./sentinel-share-backend

docker tag ${ECR_REPO}:latest \
${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest

docker push \
${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest
```

### 메모

라이프사이클 정책으로 최근 10개 이미지만 유지하는 설정은 추가해도 좋다.

---

## Step 11. S3 생성

### 콘솔에서 하는 방법

1. `S3 -> Create bucket`
2. 로그 버킷 이름은 `secure-log`
3. Block Public Access는 모두 활성화
4. 애플리케이션 파일 버킷은 프로젝트 정책에 맞게 따로 생성

### CLI

```bash
aws s3api create-bucket \
  --bucket $APP_BUCKET \
  --region $AWS_REGION \
  --create-bucket-configuration LocationConstraint=$AWS_REGION

aws s3api put-public-access-block \
  --bucket $APP_BUCKET \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api create-bucket \
  --bucket $LOG_BUCKET \
  --region $AWS_REGION \
  --create-bucket-configuration LocationConstraint=$AWS_REGION
```

---

## Step 12. RDS Subnet Group 및 RDS 생성

### 콘솔에서 하는 방법

1. `RDS -> Subnet groups -> Create DB subnet group`
2. 이름은 `secure-db-subnet-group`
3. VPC는 `secure-vpc`
4. 기본 서브넷은 `secure-subnet-private`
5. 필요 시 다른 AZ의 보조 private subnet을 추가
6. `RDS -> Databases -> Create database`
7. 엔진은 PostgreSQL `17.9`
8. 템플릿은 Free tier
9. DB identifier는 `secure-db`
10. 마스터 사용자 이름은 `secureadmin`
11. 비밀번호는 콘솔에서 직접 강한 값으로 생성
12. DB subnet group은 `secure-db-subnet-group`
13. Public access는 `No`
14. 연결용 EC2는 `secure-bastionecs`로 생성하고 `secure-subnet-public`에 배치
15. 보안 그룹은 `secure-bastion-sg` 연결

### Bastion EC2 생성

1. `EC2 -> Instances -> Launch instances`
2. 이름은 `secure-bastionecs`
3. 서브넷은 `secure-subnet-public`
4. 보안 그룹은 `secure-bastion-sg`
5. 퍼블릭 IP는 활성화
6. 접속 후 PostgreSQL 클라이언트를 설치해 `secure-db` 연결을 확인

### CLI

```bash
aws rds create-db-subnet-group \
  --region $AWS_REGION \
  --db-subnet-group-name $DB_SUBNET_GROUP \
  --db-subnet-group-description "secure db subnet group" \
  --subnet-ids $PRIVATE_SUBNET_ID

# AWS가 다른 AZ subnet을 요구하면 보조 subnet을 추가한 뒤 아래처럼 함께 지정
# --subnet-ids $PRIVATE_SUBNET_ID $PRIVATE_SUBNET_2C_ID

aws ec2 run-instances \
  --region $AWS_REGION \
  --image-id <AMAZON_LINUX_2023_AMI_ID> \
  --instance-type t3.micro \
  --subnet-id $PUBLIC_SUBNET_ID \
  --security-group-ids $BASTION_SG_ID \
  --associate-public-ip-address \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=secure-bastionecs}]"

aws rds create-db-instance \
  --region $AWS_REGION \
  --db-instance-identifier $DB_IDENTIFIER \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 17.9 \
  --master-username $DB_USER \
  --master-user-password $DB_PASSWORD \
  --allocated-storage 20 \
  --db-name $DB_NAME \
  --vpc-security-group-ids $RDS_SG_ID \
  --db-subnet-group-name $DB_SUBNET_GROUP \
  --no-publicly-accessible
```

### 메모

현재 저장소 기준 앱 DB 이름은 `sentinelshare`가 가장 자연스럽다.  
비밀번호는 문서에 고정 문자열을 적지 말고 Secrets Manager에 바로 저장할 수 있는 강한 값으로 생성하는 것이 맞다.  
또한 AWS 콘솔에서 subnet group 요건 때문에 보조 subnet을 추가하라고 나오면 다른 AZ subnet을 추가해 진행하면 된다.

---

## Step 13. Secrets Manager 생성

### 콘솔에서 하는 방법

1. `Secrets Manager -> Store a new secret`
2. JWT secret 저장
3. DB 접속 정보 저장
4. S3 버킷 이름 저장
5. DB 비밀번호는 RDS 생성 시 사용한 실제 강한 값을 저장
6. 필요 시 `s3cure-taskexecutionrole`에 인라인 정책으로 secret 조회 권한 추가

### CLI

```bash
aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name sentinelshare/jwt-secret \
  --secret-string "<YOUR_JWT_SECRET>"

aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name sentinelshare/db-credentials \
  --secret-string "{\"host\":\"<RDS_ENDPOINT>\",\"dbname\":\"$DB_NAME\",\"username\":\"$DB_USER\",\"password\":\"$DB_PASSWORD\"}"

aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name sentinelshare/s3-bucket-name \
  --secret-string "$APP_BUCKET"

aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name sentinelshare/cors-origin \
  --secret-string "http://localhost:3001"
```

### 메모

DB 비밀번호는 `s3cure123!` 같은 고정 예시를 재사용하지 말고, 실제 생성한 강한 값을 그대로 secret에 저장해야 한다.

---

## Step 14. CloudWatch Logs 생성

### 콘솔에서 하는 방법

1. `CloudWatch -> Log groups -> Create log group`
2. 이름은 `/ecs/secure-task`

### CLI

```bash
aws logs create-log-group \
  --region $AWS_REGION \
  --log-group-name $LOG_GROUP
```

---

## Step 15. ECS Cluster 생성

### 콘솔에서 하는 방법

1. `ECS -> Clusters -> Create cluster`
2. 인프라는 `AWS Fargate`
3. 이름은 `secure-cluster`

### CLI

```bash
aws ecs create-cluster \
  --region $AWS_REGION \
  --cluster-name $CLUSTER_NAME
```

---

## Step 16. Task Definition 작성 및 등록

### 콘솔에서 하는 방법

1. `ECS -> Task definitions -> Create new task definition`
2. 이름은 `secure-task`
3. Launch type은 `AWS Fargate`
4. Task role은 `s3cure-taskrole`
5. Task execution role은 `s3cure-taskexecutionrole`
6. Container name은 `secure-container`
7. Image URI는 `s3cure-api`의 URI
8. Port는 현재 저장소 기준 `3000`
9. 로그 그룹은 `/ecs/secure-task`

### 예시 파일

파일명: `secure-task-definition.json`

```json
{
  "family": "secure-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/s3cure-taskexecutionrole",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/s3cure-taskrole",
  "containerDefinitions": [
    {
      "name": "secure-container",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/s3cure-api:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" },
        { "name": "AWS_REGION", "value": "ap-northeast-2" },
        { "name": "PRESIGNED_URL_TTL", "value": "300" },
        { "name": "MAX_FILE_SIZE_MB", "value": "100" },
        { "name": "JWT_EXPIRES_IN", "value": "1h" },
        { "name": "ALLOWED_MIME_TYPES", "value": "image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip" }
      ],
      "secrets": [
        { "name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/jwt-secret" },
        { "name": "DB_HOST", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/db-credentials:host::" },
        { "name": "DB_NAME", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/db-credentials:dbname::" },
        { "name": "DB_USER", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/db-credentials:username::" },
        { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/db-credentials:password::" },
        { "name": "S3_BUCKET_NAME", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/s3-bucket-name" },
        { "name": "CORS_ORIGIN", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/cors-origin" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/secure-task",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### CLI

```bash
aws ecs register-task-definition \
  --region $AWS_REGION \
  --cli-input-json file://secure-task-definition.json
```

---

## Step 17. ECS Service 생성

### 콘솔에서 하는 방법

1. `ECS -> Clusters -> secure-cluster -> Services -> Create`
2. Task definition은 `secure-task`
3. Service name은 `secure-service`
4. Subnet은 `secure-subnet-private`
5. Security group은 `secure-container-sg`
6. Public IP는 `Off`
7. 이 단계까지는 내부 전용 서비스로 배포된 상태임을 확인
8. 외부 사용자 접속이 필요하면 별도 단계로 `ALB` 또는 `CloudFront + ALB`를 추가

### CLI

```bash
aws ecs create-service \
  --region $AWS_REGION \
  --cluster $CLUSTER_NAME \
  --service-name $SERVICE_NAME \
  --task-definition $TASK_FAMILY \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_ID],securityGroups=[$CONTAINER_SG_ID],assignPublicIp=DISABLED}"
```

### 메모

이 상태에서는 외부 인터넷에서 직접 접근할 수 없다.  
즉 여기까지의 결과는 `보안 양호한 내부 서비스 배포`이며, 외부 공개가 필요하면 이후 단계에서 `ALB` 또는 `CloudFront + ALB`를 붙여야 한다.

---

## Step 18. 확인

### 콘솔에서 하는 방법

1. ECS 서비스 상태 확인
2. RDS 인스턴스 상태 확인
3. CloudWatch 로그 스트림 확인
4. ECR 이미지와 S3 버킷 생성 여부 확인

### CLI

```bash
aws ecs list-services --region $AWS_REGION --cluster $CLUSTER_NAME
aws ecs list-tasks --region $AWS_REGION --cluster $CLUSTER_NAME
aws logs describe-log-streams --region $AWS_REGION --log-group-name $LOG_GROUP
aws rds describe-db-instances --region $AWS_REGION --db-instance-identifier $DB_IDENTIFIER
```

---

## GitHub Actions / OIDC / ECR Push

### 콘솔에서 하는 방법

1. `IAM -> Identity providers -> Add provider`
2. Provider type은 `OpenID Connect`
3. Provider URL은 `https://token.actions.githubusercontent.com`
4. Audience는 `sts.amazonaws.com`
5. `IAM -> Roles -> Create role`
6. Web identity 선택
7. GitHub repo 조건을 trust policy에 제한
8. 역할 이름은 `CloudShield-Role`
9. `AmazonEC2ContainerRegistryPowerUser` 연결
10. GitHub repo secrets에 역할 ARN 등록

### 메모

GitHub Actions용 시크릿 권장 값:

- `AWS_ACCOUNT_ID`
- `AWS_REGION`
- `AWS_ROLE_TO_ASSUME`

---

## VPC Peering 참고

### 콘솔에서 하는 방법

1. `VPC -> Peering connections -> Create peering connection`
2. 이름은 `wazuh-peering`
3. 요청자 VPC는 `main-vpc`
4. 수락자 VPC는 `vul-vpc`, `secure-vpc`
5. 이후 관련 보안 그룹에 필요한 포트 추가

### 메모

`amin-sg-private` 인바운드 규칙:

- Custom TCP `1514` from `10.2.0.0/16`, `10.3.0.0/16`
- Custom TCP `1515` from `10.2.0.0/16`, `10.3.0.0/16`
- Custom TCP `55000` from `10.1.0.0/16`

---

## 최종 점검

- `secure-vpc`
- `secure-subnet-public`
- `secure-subnet-private`
- `secure-igw`
- `secure-nat`
- `secure-rt-public`
- `secure-rt-private`
- `s3cure-taskexecutionrole`
- `s3cure-taskrole`
- `s3cure-api`
- `secure-db-subnet-group`
- `secure-db`
- `secure-bastionecs`
- `secure-container-sg`
- `secure-bastion-sg`
- `secure-rds-sg`
- `secure-cluster`
- `secure-task`
- `secure-service`
- `secure-container`
- `/ecs/secure-task`

위 이름들이 요청한 항목 기준으로 문서에 반영되어 있다.
