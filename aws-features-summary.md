자동 배포 `secure` 환경에 새 WAF 규칙을 반영하려면, 기존 secure Terraform을 한 번 더 `apply` 하면 됩니다.  
이 프로젝트에서는 가장 쉬운 방법이 `Attack Dashboard`의 자동 배포 화면에서 다시 적용하는 방식입니다.

가장 쉬운 방법: 대시보드에서 다시 apply

1. 브라우저에서 자동 배포 화면으로 이동
- `attack-dashboard`의 자동 배포 워크스페이스 화면으로 이동

2. `보안 환경` 패널에서 액션을 `apply`로 선택

3. `공격 실행`이 아니라 `인프라 자동 배포/삭제` 영역에서 보안 환경 실행 버튼 클릭
- 실제 UI 로직은 `InfraControl` 컴포넌트에서 처리

4. 이 버튼을 누르면 내부적으로 GitHub Actions의 secure Terraform workflow가 다시 실행
- 연결 API: `/api/infra/deploy`
- 실제 워크플로: `terraform-secure.yml`

5. 완료되면 secure 환경의 CloudFront / WAF 설정이 새 코드 기준으로 다시 반영

6. 그 다음 자동 배포 Attack Simulator에서 아래 시나리오 재실행
- `SQLi / XSS 차단 비교`
- `봇 요청 차단 비교`

이 방식에서 실제로 일어나는 일

- Terraform이 secure 환경 상태를 읽음
- 변경된 WAF 규칙만 diff 계산
- 필요한 리소스만 업데이트
- 새 Web ACL 규칙이 CloudFront에 연결된 상태로 반영

즉, 인프라를 처음부터 지우고 다시 만드는 것이 아니라, 보통은 `apply`만 다시 하면 충분합니다.

GitHub Actions에서 직접 하는 방법

1. GitHub 저장소의 `Actions` 탭 이동
2. `Terraform — Secure Environment` 선택
3. `Run workflow` 클릭
4. `action = apply` 선택
5. 실행
6. 완료 후 secure 환경에서 다시 공격 시뮬레이션 실행

로컬 CLI에서 직접 하는 방법

```powershell
cd "C:\Users\User\Desktop\AWS Guide\Sentinel_Share\infra\terraform\environments\secure"
terraform init
terraform plan
terraform apply
```

민감값이 필요하면 `TF_VAR_db_password`, `TF_VAR_jwt_secret` 같은 Terraform 변수도 함께 설정해야 합니다.  
그래서 이 프로젝트에서는 보통 `대시보드 방식`이나 `GitHub Actions 방식`이 더 안전하고 편합니다.

언제 반영이 끝난 것으로 보면 되는지

- secure Terraform apply 성공
- CloudFront / WAF 관련 단계 성공
- 이후 `auto` 공격 시뮬레이터에서
  - `SQLi / XSS`는 secure 쪽이 `WAF 차단`
  - `봇 스캔`은 secure 쪽이 앞단 차단 또는 흡수
  형태로 표시

주의할 점

- CloudFront / WAF 변경은 바로 반영되지 않고 몇 분 정도 걸릴 수 있음
- apply 직후 바로 테스트하면 이전 전파 상태가 남아 있을 수 있어 잠깐 기다리는 것이 좋음
- `manual` 환경은 Terraform auto apply와 별개이므로, 수동으로 만든 secure 환경에는 이 새 WAF 규칙이 자동 반영되지 않음

가장 추천하는 방법

- `Attack Dashboard -> 자동 배포 화면 -> 보안 환경 apply 다시 실행 -> 완료 후 auto 공격 시뮬레이터 재테스트`
