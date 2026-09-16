import { getAccessUser } from "@/lib/auth";
import { AccessConfigurationError, type AccessUser } from "@/lib/access";
import { env } from "cloudflare:workers";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  let user: AccessUser | null;
  try {
    user = await getAccessUser();
  } catch (error) {
    if (!(error instanceof AccessConfigurationError)) throw error;
    return <main className="login-shell"><div className="login-card"><div className="brand-mark">D</div><p className="eyebrow">DELIVERY DESK</p><h1>Προσωρινά μη διαθέσιμο.</h1><p className="muted">Η υπηρεσία σύνδεσης δεν είναι διαθέσιμη. Δοκίμασε ξανά αργότερα.</p></div></main>;
  }
  const environment = env.APP_ENV === "UAT" ? "UAT" : "Production";
  if (!user) return <main className="login-shell"><div className="login-card"><div className="brand-mark">D</div><p className="eyebrow">DELIVERY DESK</p><h1>Τα έργα σου.<br />Η επόμενη ενέργεια.</h1><p className="muted">Χρειάζεται σύνδεση για να ανοίξεις τον προσωπικό σου χώρο.</p><a className="login-button" href="/" target="_top">Σύνδεση <span aria-hidden="true">↗</span></a><p className="small-note">Πρόσβαση μόνο στους εγκεκριμένους χρήστες.</p></div></main>;
  return <Workspace user={{name:user.displayName,email:user.email}} environment={environment} />;
}
