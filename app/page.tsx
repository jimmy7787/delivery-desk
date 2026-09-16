import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import { env } from "cloudflare:workers";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  const environment = (env as unknown as { APP_ENV?: string }).APP_ENV === "UAT" ? "UAT" : "Production";
  if (!user) return <main className="login-shell"><div className="login-card"><div className="brand-mark">D</div><p className="eyebrow">DELIVERY DESK</p><h1>Τα έργα σου.<br />Η επόμενη ενέργεια.</h1><p className="muted">Συνδέσου για να διαχειριστείς projects, εργασίες και προθεσμίες στον προσωπικό σου χώρο.</p><a className="login-button" href={chatGPTSignInPath("/")} target="_top">Σύνδεση με ChatGPT <span aria-hidden="true">↗</span></a><p className="small-note">Πρόσβαση με τον δικό σου λογαριασμό.</p></div></main>;
  return <Workspace user={{name:user.displayName,email:user.email}} environment={environment} />;
}
