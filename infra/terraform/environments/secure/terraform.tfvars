# terraform.tfvars — 민감 정보는 TF_VAR_* 환경변수로 전달
# db_password 와 jwt_secret 은 TF_VAR_db_password, TF_VAR_jwt_secret 환경변수 사용
# frontend_origin 은 실제 secure 프론트엔드 URL을 사용
# 예: frontend_origin = "https://xxxxxxxxxxxx.cloudfront.net"

aws_region = "ap-northeast-2"
