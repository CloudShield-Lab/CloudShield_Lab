# SentinelShare — Claude Code Context

## 사용자 설정
- 커밋 메시지에 `Co-Authored-By` 태그 포함 금지

## Project Overview
Cloud Security Impact Simulator — 동일 앱 코드를 취약/보안 두 AWS 환경에 배포 후 공격 시뮬레이터로 효과 비교.

```
SentinelShare/
├── sentinel-share-backend/   Node.js/Express API
├── sentinel-share-frontend/  Next.js 15 사용자 UI
├── attack-dashboard/         보안 비교 시뮬레이터 (ECS Fargate)
├── infra/terraform/          취약/보안 환경 IaC
└── .github/workflows/        CI/CD
```

## Roadmap
| 단계 | 내용 | STATUS |
|---|---|---|
| 1단계 | Attack Dashboard + ECS 배포 | [완료] |
| 2단계 | EC2 Docker + S3 + CloudFront | [완료] |
| 3단계 | Wazuh + Trivy + Prowler | [진행 중] |
| 4단계 | Terraform 인프라 자동화 | [완료] |
| 4.5단계 | AI 사후 분석 탭 (Bedrock) | [완료] |
| 5단계 | Prometheus + Grafana + Loki | [계획] |

## 최근 변경 이력 (2026-03-18)

### AI 사후 분석 탭 (Phase 1)
- 공격 시나리오 완료 시 세션 데이터 S3 자동 저장 (`analysis-sessions/` prefix)
- `/manual/analysis`, `/auto/analysis` 신규 페이지 — 세션 목록 + AI 분석
- Amazon Bedrock (Claude 3.5 Haiku) 스트리밍 분석, 한/영 토글 지원
- 신규 lib: `analysis-storage.ts`, `bedrock.ts`
- 신규 API: `/api/analysis/save`, `sessions`, `[sessionId]`, `analyze`, `wazuh-alerts`
- ECS task definition에 `ANALYSIS_S3_BUCKET`, `BEDROCK_MODEL_ID`, `BEDROCK_REGION` 추가
- **배포 후 수동 필요**: `cloudshield-dashboard-task-role`에 Bedrock + S3 인라인 정책 추가

### Wazuh Agent Terraform 통합 (Phase 2)
- `wazuh_manager_ip` 변수 추가 (secure/vulnerable 환경 + ec2 모듈)
- `user_data.sh.tpl`에 조건부 Wazuh 4.x agent 설치 블록 추가
- EC2 SG에 Wazuh egress 규칙 (1514/1515 TCP) 동적 추가
- 배포 시: `terraform apply -var="wazuh_manager_ip=X.X.X.X"`

## Security Rules (절대 위반 금지)
- SQL은 항상 `db.query(text, [$1 params])` — 문자열 연결 절대 금지
- S3 presigned URL 생성 전 반드시 파일 소유권 또는 share token 검증
- `stored_key` 값을 API 응답에 절대 포함하지 않음
- 모든 파일 쿼리에 `is_deleted = false` 조건 필수
- `authLimiter` auth 라우트에 추가 금지 — rate limit은 WAF 담당 (의도적 설계)
- `*.tfstate` 커밋 금지 — S3 backend 사용
- 시크릿을 코드나 `.env.example`에 저장 금지

## Key Architectural Decisions
- **두 환경 비교**: 동일 Docker 이미지, 인프라 설정(S3 정책, WAF, CloudFront, SG)만 다름
- **EC2 (not Fargate)**: Wazuh agent OS 레벨 접근 필요. Attack Dashboard만 Fargate 유지
- **PostgreSQL EC2 동거**: 별도 RDS 없음. `terraform destroy` 시 DB 함께 정리 (데모 특성)
- **No ALB**: CloudFront가 HTTPS/CDN. 보안 SG는 CloudFront prefix list `pl-22a6434b`만 허용
- **Presigned URLs only**: 백엔드는 파일 바이트 프록시 금지. 소유권 검증 후 presigned URL 발급 (5분 TTL)
- **NEXT_PUBLIC_API_URL에 /api suffix 포함**: `https://domain.com/api` 형태, 프론트는 `/auth/login` 등 상대 경로만 붙임
- **attack-dashboard URL은 /api suffix 제거**: attack route는 `normalizeApiBaseUrl()` 적용 후 `/api/...` 직접 붙임
- **SSM 마이그레이션**: `docker cp`로 파일 추출 후 EC2 호스트 psql 실행 (Node.js 컨테이너에 psql 없음)
- **InfraControl 초기화 버튼**: SSE만 끊고 GitHub Actions 계속 실행 (의도적 — 중간 취소 시 리소스 상태 꼬임 방지)
- **Terraform state S3 backend**: `sentinelshare-terraform-state-833453046706-ap-northeast-2-an`
- **WAF scope CLOUDFRONT → us-east-1 필수**: `environments/secure/main.tf`에 provider alias 선언
- **InfraControl workflow_dispatch ref**: `'dev'` 고정 (`api/infra/deploy/route.ts`)
- **CloudFront custom_error_response 오탐**: WAF 403 → CF가 200+HTML로 변환. attack route에서 Content-Type 체크로 재판정 필수
- **수동/자동 모드 분리**: attack-dashboard는 `/manual/*`(수동 구성 URL)과 `/auto/*`(Terraform 배포 URL) 별도 운영. `WorkspaceMode` 타입으로 전파
- **tfstate 자동 읽기**: `/api/config`가 AUTO_* env var 없을 때 S3 tfstate 직접 파싱 (30초 캐시). ECS task role에 tfstate 버킷 GetObject 권한 필요
- **AI 사후 분석**: 공격 세션 완료 → S3 저장 → Bedrock Claude 스트리밍 분석. S3 key: `analysis-sessions/{mode}/{scenario}/{sessionId}.json`
- **Bedrock 리전 us-east-1 고정**: Claude 모델은 us-east-1에서만 사용 가능. `BEDROCK_REGION` 환경변수로 overide 가능
- **로컬 개발 시 S3 graceful 처리**: `/api/analysis/sessions` 자격증명 없으면 빈 배열 반환 (503 아님)
- **Wazuh agent 조건부 설치**: `wazuh_manager_ip` 변수 비어있으면 설치 스킵 — 기본값 `""` 으로 기존 배포 영향 없음
