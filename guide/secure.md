# Secure Guide

## 개요

이 장에서는 Sentinel Share 공격 시나리오 테스트를 위한 보안 양호 환경(`secure`)을 구축한다.  
문서의 목표는 네트워크, IAM, ECR, RDS, S3, ECS Fargate까지 이어지는 전체 실습 흐름을 한 번에 따라갈 수 있도록 정리하는 것이다.

이 가이드는 `secure` 환경 기준으로 작성한다.  
`main`, `vul` 환경도 동일한 명명 규칙을 그대로 적용하면 된다.

---

## 설계 원칙

- 리전: `ap-northeast-2`
- 기본 가용 영역: `ap-northeast-2a`
- 네이밍 규칙: `(구분)-(기능)-(public/private)`
- 구분: `main`, `secure`, `vul`
- 기능: 전체 소문자
- `public/private`는 필요한 경우에만 붙인다

예시:

- `main-rt-public`
- `secure-subnet-private`
- `vul-taskexecutionrole`

이 문서에서는 사용자 메모의 `s3cure-*` 표기를 전체 네이밍 규칙과 맞추기 위해 `secure-*` 형식으로 통일한다.

---

## 정확성 확인 결과

이 가이드는 전체 흐름을 다시 점검해서 아래 두 가지를 보정했다.

1. RDS DB subnet group은 실제 AWS에서 서로 다른 가용 영역의 서브넷 2개 이상이 필요하다.  
   따라서 원래 메모의 `secure-subnet-private` 1개만으로는 RDS 생성이 막힐 수 있다.  
   이 문서의 CLI 예시는 `secure-subnet-private-a`, `secure-subnet-private-c` 두 개를 사용한다.

2. ECS 서비스를 private subnet에 두고 `assignPublicIp=DISABLED`로 배포하면 외부에서 바로 접근할 수 없다.  
   즉, 실제 서비스 접속을 하려면 이후 단계에서 `ALB`, `NLB`, `CloudFront + ALB`, 또는 `VPC 피어링 기반 내부 호출` 중 하나를 추가해야 한다.

---

## Secure 환경 기준 리소스 이름

| 항목 | 이름 | 값/설명 |
|---|---|---|
| VPC | `secure-vpc` | `10.2.0.0/16` |
| Public Subnet | `secure-subnet-public` | `10.2.1.0/24`, `ap-northeast-2a` |
| Private Subnet A | `secure-subnet-private-a` | `10.2.101.0/24`, `ap-northeast-2a` |
| Private Subnet C | `secure-subnet-private-c` | `10.2.102.0/24`, `ap-northeast-2c` |
| Internet Gateway | `secure-igw` | `secure-vpc`에 연결 |
| NAT Gateway | `secure-nat` | `secure-subnet-public`에 생성 |
| Public Route Table | `secure-rt-public` | `0.0.0.0/0 -> secure-igw` |
| Private Route Table | `secure-rt-private` | `0.0.0.0/0 -> secure-nat` |
| ECS Task Execution Role | `secure-taskexecutionrole` | ECS 실행용 |
| ECS Task Role | `secure-taskrole` | 애플리케이션 런타임용 |
| ECR Repository | `secure-api` | Private repository |
| Container Security Group | `secure-container-sg` | ECS 태스크용 |
| Bastion Security Group | `secure-bastion-sg` | 점검용 EC2/Bastion |
| RDS Security Group | `secure-rds-sg` | PostgreSQL 허용 |
| DB Subnet Group | `secure-db-subnet-group` | Private subnet 2개 기반 |
| RDS Instance | `secure-db` | PostgreSQL 17.9 |
| ECS Cluster | `secure-cluster` | Fargate 클러스터 |
| ECS Task Definition | `secure-task` | Fargate task |
| ECS Service | `secure-service` | desired count 1 이상 |
| ECS Container Name | `secure-container` | 포트 `3000` 사용 |
| App Bucket | `secure-files-private` | 업로드 파일 저장 |
| Log Bucket | `secure-log` | 선택 로그 버킷 |
| CloudWatch Log Group | `/ecs/secure-task` | ECS 로그 |

---

## Step 0. 사전 준비

먼저 AWS CLI 인증과 공통 변수를 설정한다.

### 설명

- `aws configure`로 CLI 인증 정보를 등록한다.
- `aws sts get-caller-identity`로 현재 계정이 맞는지 확인한다.
- 이후 모든 명령에서 재사용할 변수를 미리 export 한다.

### CLI

```bash
aws configure
aws sts get-caller-identity

AWS_REGION=ap-northeast-2
AWS_AZ_PUBLIC=ap-northeast-2a
AWS_AZ_PRIVATE_A=ap-northeast-2a
AWS_AZ_PRIVATE_C=ap-northeast-2c
AWS_ACCOUNT_ID=<YOUR_ACCOUNT_ID>
MY_IP=<YOUR_PUBLIC_IP>/32

VPC_NAME=secure-vpc
VPC_CIDR=10.2.0.0/16

PUBLIC_SUBNET_NAME=secure-subnet-public
PUBLIC_SUBNET_CIDR=10.2.1.0/24

PRIVATE_SUBNET_A_NAME=secure-subnet-private-a
PRIVATE_SUBNET_A_CIDR=10.2.101.0/24

PRIVATE_SUBNET_C_NAME=secure-subnet-private-c
PRIVATE_SUBNET_C_CIDR=10.2.102.0/24

IGW_NAME=secure-igw
NAT_NAME=secure-nat
PUBLIC_RT_NAME=secure-rt-public
PRIVATE_RT_NAME=secure-rt-private

TASK_EXEC_ROLE=secure-taskexecutionrole
TASK_ROLE=secure-taskrole
ECR_REPO=secure-api

CLUSTER_NAME=secure-cluster
TASK_FAMILY=secure-task
SERVICE_NAME=secure-service
CONTAINER_NAME=secure-container

DB_SUBNET_GROUP=secure-db-subnet-group
DB_IDENTIFIER=secure-db
DB_NAME=sentinelshare
DB_USER=sentinelshare_user
DB_PASSWORD='<STRONG_PASSWORD>'

APP_BUCKET=secure-files-private
LOG_BUCKET=secure-log
LOG_GROUP=/ecs/secure-task
```

---

## Step 1. VPC 생성

### 설명

`secure-vpc`를 생성하고 DNS 기능을 활성화한다.

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

### 체크 포인트

- `secure-vpc`가 생성되었는지 확인
- DNS hostnames / DNS resolution이 활성화되었는지 확인

---

## Step 2. 퍼블릭 서브넷 생성

### 설명

NAT Gateway와 향후 bastion, ALB 같은 퍼블릭 진입 리소스를 위해 퍼블릭 서브넷을 생성한다.

### CLI

```bash
PUBLIC_SUBNET_ID=$(aws ec2 create-subnet \
  --region $AWS_REGION \
  --vpc-id $VPC_ID \
  --cidr-block $PUBLIC_SUBNET_CIDR \
  --availability-zone $AWS_AZ_PUBLIC \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$PUBLIC_SUBNET_NAME}]" \
  --query 'Subnet.SubnetId' \
  --output text)

aws ec2 modify-subnet-attribute \
  --region $AWS_REGION \
  --subnet-id $PUBLIC_SUBNET_ID \
  --map-public-ip-on-launch
```

### 체크 포인트

- `secure-subnet-public`이 `ap-northeast-2a`에 생성되었는지 확인
- 퍼블릭 IP 자동 할당이 활성화되었는지 확인

---

## Step 3. 프라이빗 서브넷 생성

### 설명

애플리케이션과 데이터베이스는 프라이빗 네트워크에 두는 것을 기본 원칙으로 한다.  
RDS를 위해 private subnet을 서로 다른 AZ에 2개 만든다.

### CLI

```bash
PRIVATE_SUBNET_A_ID=$(aws ec2 create-subnet \
  --region $AWS_REGION \
  --vpc-id $VPC_ID \
  --cidr-block $PRIVATE_SUBNET_A_CIDR \
  --availability-zone $AWS_AZ_PRIVATE_A \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$PRIVATE_SUBNET_A_NAME}]" \
  --query 'Subnet.SubnetId' \
  --output text)

PRIVATE_SUBNET_C_ID=$(aws ec2 create-subnet \
  --region $AWS_REGION \
  --vpc-id $VPC_ID \
  --cidr-block $PRIVATE_SUBNET_C_CIDR \
  --availability-zone $AWS_AZ_PRIVATE_C \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$PRIVATE_SUBNET_C_NAME}]" \
  --query 'Subnet.SubnetId' \
  --output text)
```

### 체크 포인트

- `secure-subnet-private-a`가 `ap-northeast-2a`에 생성되었는지 확인
- `secure-subnet-private-c`가 `ap-northeast-2c`에 생성되었는지 확인

---

## Step 4. 인터넷 게이트웨이 생성 및 연결

### 설명

퍼블릭 서브넷이 외부와 통신하려면 IGW가 필요하다.

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

### 체크 포인트

- `secure-igw`가 `secure-vpc`에 연결되었는지 확인

---

## Step 5. NAT Gateway 생성

### 설명

프라이빗 서브넷에 있는 ECS 태스크가 ECR pull, 패키지 다운로드, 외부 AWS API 호출을 할 수 있도록 NAT Gateway를 만든다.

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

### 체크 포인트

- `secure-nat`가 퍼블릭 서브넷에 생성되었는지 확인
- NAT 상태가 `available`인지 확인

---

## Step 6. 퍼블릭 라우트 테이블 생성

### 설명

퍼블릭 서브넷 전용 라우트 테이블을 생성하고 IGW로 기본 라우트를 건다.

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

### 설명

프라이빗 서브넷 전용 라우트 테이블을 만들고 NAT Gateway로 기본 라우트를 건다.

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
  --subnet-id $PRIVATE_SUBNET_A_ID

aws ec2 associate-route-table \
  --region $AWS_REGION \
  --route-table-id $PRIVATE_RT_ID \
  --subnet-id $PRIVATE_SUBNET_C_ID
```

---

## Step 8. 보안 그룹 생성

### 설명

현재 백엔드 코드는 `PORT=3000`을 사용한다.  
따라서 컨테이너 보안 그룹 인바운드는 `3000` 기준으로 맞춘다.

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
  --ip-permissions '[{"IpProtocol":"tcp","FromPort":3000,"ToPort":3000,"IpRanges":[{"CidrIp":"10.2.0.0/16"}]}]'

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

### 정확성 메모

- 지금 규칙은 같은 VPC 내부 `10.2.0.0/16`에서 `3000` 접근을 허용한다.
- 나중에 `ALB`를 붙일 계획이면 컨테이너 SG는 `ALB SG만 허용`하도록 더 좁히는 것이 좋다.
- `main` VPC에서 피어링으로 직접 호출할 계획이면 `10.1.0.0/16` 또는 `main` 측 SG를 추가로 허용해야 한다.

---

## Step 9. ECS Task Role / Execution Role 생성

### 설명

현재 저장소의 백엔드는 PostgreSQL, S3, Secrets Manager를 사용한다.  
DynamoDB와 Redis 관련 항목은 현재 코드에서 사용하지 않으므로 보안 양호 환경 가이드에서는 제외한다.

### Trust Policy 파일

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

### Task Role 인라인 정책 파일

파일명: `secure-taskrole-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3FileOperations",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::secure-files-private/uploads/*"
    }
  ]
}
```

### Execution Role의 Secrets 정책 파일

파일명: `secure-taskexecution-secrets-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
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
  --policy-name secure-taskexecution-secrets \
  --policy-document file://secure-taskexecution-secrets-policy.json

aws iam create-role \
  --role-name $TASK_ROLE \
  --assume-role-policy-document file://ecs-task-trust-policy.json

aws iam put-role-policy \
  --role-name $TASK_ROLE \
  --policy-name secure-taskrole-inline \
  --policy-document file://secure-taskrole-policy.json
```

---

## Step 10. ECR 생성 및 Docker 이미지 Push 테스트

### 설명

ECR에 이미지가 정상적으로 올라가는지 먼저 확인한다.

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

### 체크 포인트

- `secure-api` 리포지토리가 생성되었는지 확인
- `latest` 태그 이미지가 올라갔는지 확인
- 이미지 스캔이 수행되는지 확인

---

## Step 11. S3 생성

### 설명

Sentinel Share 백엔드는 업로드 파일 저장용 S3 버킷이 필요하다.  
로그 저장 버킷은 선택 사항이지만 분리하는 편이 좋다.

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

### 체크 포인트

- `secure-files-private` 버킷이 생성되었는지 확인
- Block Public Access가 활성화되었는지 확인

---

## Step 12. RDS Subnet Group 및 RDS 생성

### 설명

현재 저장소의 백엔드 코드는 `DB_NAME=sentinelshare`를 기준으로 동작한다.  
따라서 초기 데이터베이스 이름은 비워두지 말고 `sentinelshare`로 맞추는 것을 권장한다.

### CLI

```bash
aws rds create-db-subnet-group \
  --region $AWS_REGION \
  --db-subnet-group-name $DB_SUBNET_GROUP \
  --db-subnet-group-description "secure db subnet group" \
  --subnet-ids $PRIVATE_SUBNET_A_ID $PRIVATE_SUBNET_C_ID

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

aws rds wait db-instance-available \
  --region $AWS_REGION \
  --db-instance-identifier $DB_IDENTIFIER

RDS_ENDPOINT=$(aws rds describe-db-instances \
  --region $AWS_REGION \
  --db-instance-identifier $DB_IDENTIFIER \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)
```

### 체크 포인트

- `secure-db-subnet-group` 생성 여부
- `secure-db` 인스턴스 상태가 `available`인지 확인
- `RDS_ENDPOINT` 값이 조회되는지 확인

---

## Step 13. Secrets Manager 생성

### 설명

현재 저장소 코드 기준 필수 시크릿은 다음과 같다.

- `JWT_SECRET`
- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `S3_BUCKET_NAME`
- `CORS_ORIGIN`

### CLI

```bash
aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name sentinelshare/jwt-secret \
  --secret-string "<YOUR_JWT_SECRET>"

aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name sentinelshare/db-credentials \
  --secret-string "{\"host\":\"$RDS_ENDPOINT\",\"dbname\":\"$DB_NAME\",\"username\":\"$DB_USER\",\"password\":\"$DB_PASSWORD\"}"

aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name sentinelshare/s3-bucket-name \
  --secret-string "$APP_BUCKET"

aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name sentinelshare/cors-origin \
  --secret-string "http://localhost:3001"
```

### 정확성 메모

- 실제 운영에서 `cors-origin`은 배포된 프론트엔드 또는 CloudFront 도메인으로 바꾸는 것이 맞다.
- ECS task definition에서 JSON 시크릿을 참조하므로 `db-credentials` 구조를 유지해야 한다.

---

## Step 14. CloudWatch Logs 생성

### 설명

ECS 로그용 CloudWatch 로그 그룹을 미리 만든다.

### CLI

```bash
aws logs create-log-group \
  --region $AWS_REGION \
  --log-group-name $LOG_GROUP
```

---

## Step 15. ECS Cluster 생성

### 설명

Secure 환경의 Fargate 클러스터를 생성한다.

### CLI

```bash
aws ecs create-cluster \
  --region $AWS_REGION \
  --cluster-name $CLUSTER_NAME
```

---

## Step 16. Task Definition JSON 작성 및 등록

### 설명

현재 저장소의 백엔드는 포트 `3000`을 사용하며, 실제 환경변수 이름은 아래 파일 기준으로 맞춘다.

- `sentinel-share-backend/src/config/env.js`
- `sentinel-share-backend/infra/ecs-task-definition-secure.json`

### 예시 파일

파일명: `secure-task-definition.json`

```json
{
  "family": "secure-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/secure-taskexecutionrole",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/secure-taskrole",
  "containerDefinitions": [
    {
      "name": "secure-container",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/secure-api:latest",
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

### 정확성 메모

- `YOUR_ACCOUNT_ID`는 실제 AWS 계정 ID로 바꿔야 한다.
- 필요하면 `family`, `container name`, `image URI`를 현재 네이밍에 맞춰 다시 맞춘다.
- 시크릿 ARN은 실제 생성된 ARN으로 바꾸는 것이 가장 안전하다.

---

## Step 17. ECS Service 생성

### 설명

Private subnet에 Fargate 서비스를 배포한다.

### CLI

```bash
aws ecs create-service \
  --region $AWS_REGION \
  --cluster $CLUSTER_NAME \
  --service-name $SERVICE_NAME \
  --task-definition $TASK_FAMILY \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_A_ID,$PRIVATE_SUBNET_C_ID],securityGroups=[$CONTAINER_SG_ID],assignPublicIp=DISABLED}"
```

### 정확성 메모

- 이 상태에서는 외부 인터넷에서 바로 서비스에 접근할 수 없다.
- 실제 서비스 진입 경로가 필요하면 이후에 아래 중 하나를 추가해야 한다.
  - ALB + ECS Service
  - CloudFront + ALB
  - NLB
  - VPC 피어링 후 내부 전용 호출

---

## Step 18. 확인

### CLI

```bash
aws ecs list-services \
  --region $AWS_REGION \
  --cluster $CLUSTER_NAME

aws ecs list-tasks \
  --region $AWS_REGION \
  --cluster $CLUSTER_NAME

aws logs describe-log-streams \
  --region $AWS_REGION \
  --log-group-name $LOG_GROUP

aws rds describe-db-instances \
  --region $AWS_REGION \
  --db-instance-identifier $DB_IDENTIFIER
```

---

## GitHub Actions / OIDC / ECR Push

GitHub Actions로 이미지를 올리려면 OIDC + IAM Role 구성이 필요하다.

### OIDC 공급자

- 유형: OpenID Connect
- 공급자 URL: `https://token.actions.githubusercontent.com`
- 대상: `sts.amazonaws.com`

### GitHub Actions용 IAM Role

- 역할 이름: `CloudShield-Role`
- 엔터티 유형: 웹 자격 증명
- 권한 정책:
  - `AmazonEC2ContainerRegistryPowerUser`

신뢰 정책에서는 반드시 저장소를 제한한다.

- 예: `repo:CloudShield-Lab/CloudShield_Lab:*`

GitHub Secrets 권장 값:

- `AWS_ACCOUNT_ID`
- `AWS_REGION`
- `AWS_ROLE_TO_ASSUME`

---

## Main / Vul 환경 참고 이름

동일한 규칙으로 다음처럼 확장한다.

| 구분 | VPC | Public Subnet | Private Subnet | IGW | NAT |
|---|---|---|---|---|---|
| main | `main-vpc` | `main-subnet-public` | `main-subnet-private` | `main-igw` | `main-nat` |
| secure | `secure-vpc` | `secure-subnet-public` | `secure-subnet-private-a`, `secure-subnet-private-c` | `secure-igw` | `secure-nat` |
| vul | `vul-vpc` | `vul-subnet-public` | `vul-subnet-private` | `vul-igw` | `vul-nat` |

---

## VPC Peering 참고

Wazuh 또는 중앙 관제용 `main` 환경과 연동할 경우 아래처럼 진행한다.

- 피어링 이름: `wazuh-peering`
- 요청자 VPC: `main-vpc`
- 수락자 VPC: `secure-vpc`, `vul-vpc`

보안 그룹 참고:

- `main` 환경의 관련 보안 그룹에 `10.2.0.0/16`, `10.3.0.0/16` 대역 허용 규칙 추가
- 필요한 포트만 최소 허용:
  - `1514`
  - `1515`
  - `55000`

---

## 최종 점검 체크리스트

- `secure-vpc`와 퍼블릭/프라이빗 서브넷이 생성되었는가
- `secure-igw`, `secure-nat` 연결이 정상인가
- `secure-rt-public`, `secure-rt-private` 라우팅이 올바른가
- `secure-taskexecutionrole`, `secure-taskrole`이 준비되었는가
- `secure-api` ECR push가 성공했는가
- `secure-db`가 `available` 상태인가
- `secure-container-sg`, `secure-bastion-sg`, `secure-rds-sg`가 분리되어 있는가
- `secure-files-private` 버킷이 퍼블릭 차단 상태인가
- `secure-cluster`, `secure-task`, `secure-service`가 정상 등록되었는가
- Secrets Manager 값이 ECS task definition과 일치하는가
- 외부 접근이 필요하다면 ALB/CloudFront/NLB/피어링 중 어떤 진입 경로를 쓸지 결정했는가

---

## 흐름 검토 결과

전체적인 인프라 구축 순서는 아래처럼 보는 것이 가장 정확하다.

1. AWS CLI 인증
2. VPC / Subnet / IGW / NAT / Route
3. Security Group
4. IAM Role
5. ECR 생성 및 이미지 Push
6. S3 생성
7. RDS 생성
8. Secrets Manager 생성
9. CloudWatch Log Group 생성
10. ECS Cluster 생성
11. Task Definition 등록
12. ECS Service 생성
13. 외부 진입 경로 설계(ALB, CloudFront, 내부 호출 등)

즉, 네가 정리한 큰 흐름 자체는 맞다.  
다만 실제 AWS에서 바로 동작하도록 보정한 핵심 포인트는 아래 두 가지였다.

- RDS 때문에 private subnet은 서로 다른 AZ에 최소 2개 필요
- private ECS 서비스만 만들면 외부에서 접근할 수 없으므로 진입 경로 설계를 별도로 해야 함
