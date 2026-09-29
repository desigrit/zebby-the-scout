import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import ApplicationDashboard from "./application-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="sign-in-screen">
        <div className="sign-in-panel">
          <span className="sign-in-mark" aria-hidden="true">PM</span>
          <h1>Your applications, all in one place.</h1>
          <p>Sign in to open your private application tracker.</p>
          <a className="button button-primary" href={chatGPTSignInPath("/")} target="_top">
            Sign in with ChatGPT
          </a>
        </div>
      </main>
    );
  }

  return <ApplicationDashboard displayName={user.fullName || user.email} />;
}
