# S3 backend 설정
# terraform init 시 아래 값을 -backend-config 플래그 또는 별도 파일로 주입
#
# 사용 예:
#   terraform init \
#     -backend-config="bucket=your-tfstate-bucket" \
#     -backend-config="key=cloudshield/secure/terraform.tfstate" \
#     -backend-config="region=ap-northeast-2"

terraform {
  backend "s3" {}
}
