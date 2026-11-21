# 03 — Ad-hoc working proof

End-to-end proof that the deployed system works (not just that AWS resources exist).

| File                                     | What it proves                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `01-cross-validation-checklist.png`      | Diagram ↔ Terraform (explicit: **one** ALB spanning AZs)                  |
| `02-health-via-cloudfront.png`           | Public HTTPS path reaches RDS                                             |
| `03-demo-login-sai.png` / `.json`        | `POST /api/auth/demo` sai → 200                                           |
| `04-demo-login-siddhardth.png` / `.json` | `POST /api/auth/demo` siddhardth → 200                                    |
| `05-ui-quicktest-sai-dashboard.png`      | UI quick-test button lands on Sai dashboard with seeded accounts/activity |
