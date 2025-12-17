| Replit route (source of truth) | Current Replit page                 | Lovable best-fit page                             | Port mode                   | Notes                                                                                                            |
| ------------------------------ | ----------------------------------- | ------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/`                            | `client/src/pages/landing.tsx`      | `src/pages/Index.tsx`                             | Full page replace           | Keep all existing CTA targets/links as needed.                                                                   |
| `/login`                       | `client/src/pages/login.tsx`        | `src/pages/Login.tsx`                             | Full page replace           | Lovable’s path is `/app/login`—we’ll mount it at `/login` and rewrite internal links.                            |
| `/prepare`                     | `client/src/pages/prepare.tsx`      | `src/pages/Prepare.tsx`                           | Full page replace           | Wire to your existing API + session auth later.                                                                  |
| `/interview`                   | `client/src/pages/interview.tsx`    | `src/pages/Interview.tsx`                         | Full page replace           | Keep your current interview state machine/flow if it exists—UI can change, logic can stay.                       |
| `/coach-chat`                  | `client/src/pages/coach-chat.tsx`   | `src/pages/InterviewChat.tsx`                     | Likely full replace         | If “coach-chat” is more general than interview chat, we’ll rename/repurpose components but keep route.           |
| `/offer`                       | `client/src/pages/offer.tsx`        | `src/pages/Offer.tsx`                             | Full page replace           | Ensure pricing/offer copy remains correct.                                                                       |
| `/success`                     | `client/src/pages/success.tsx`      | `src/pages/ModuleWrapUp.tsx` (or a new composite) | Partial / composite         | Lovable wrap-up is tied to module completion route—use layout/components, but don’t force their route structure. |
| `/module/:moduleNumber`        | `client/src/pages/module.tsx`       | (no direct match)                                 | Skin + component transplant | We’ll keep your module logic and wrap it in Lovable layout + components.                                         |
| `/progress`                    | `client/src/pages/progress.tsx`     | `src/pages/Artifacts.tsx` (maybe)                 | Partial / composite         | “Artifacts” may overlap with progress; if not, we’ll just reuse the styling/components.                          |
| `/career-brief`                | `client/src/pages/career-brief.tsx` | (no direct match)                                 | Skin + component transplant | Likely use Lovable typography/cards/forms patterns.                                                              |
| `/serious-plan`                | `client/src/pages/serious-plan.tsx` | (no direct match)                                 | Skin + component transplant | Same approach—layout + components, preserve your content model.                                                  |
| `/coach-letter`                | `client/src/pages/coach-letter.tsx` | (no direct match)                                 | Skin + component transplant | Likely reuse Lovable “artifact” presentation components.                                                         |
| `*`                            | `client/src/pages/not-found.tsx`    | `src/pages/NotFound.tsx`                          | Full page replace           | Easy win.                                                                                                        |

First slice sequence:
/ (landing)
/login
/prepare
/interview
* (not-found)