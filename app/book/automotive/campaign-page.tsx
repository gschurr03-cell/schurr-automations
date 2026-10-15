import type { AutomotiveCampaign, CampaignSource } from './campaigns';
import CampaignVideo from './campaign-video';
import RevenueReviewForm from './revenue-review-form';
import './automotive.css';

export default function AutomotiveCampaignPage({ campaign, source }: { campaign: AutomotiveCampaign; source: CampaignSource }) {
  return <main className="public-booking automotive-campaign">
    <a className="auto-skip" href="#revenue-review">Skip to the form</a>
    <div className="auto-shell">
      <header className="auto-header"><a href="/" aria-label="Schurr Automations home"><img src="/schurr-fusion-approved.png" className="auto-logo" width="1254" height="1254" alt="Schurr Automations" /></a><span>{campaign.label}</span></header>
      <section className="auto-intro" aria-labelledby="auto-title"><h1 id="auto-title">{campaign.headline}</h1><p>{campaign.introduction}</p></section>
      <CampaignVideo campaign={campaign} />
      <RevenueReviewForm audience={campaign.audience} source={source} />
      <section className="auto-scope" aria-labelledby="auto-scope-title"><h2 id="auto-scope-title">A focused first project</h2><p>We review your phone routing, staff responsibilities and supported tools. Then we agree on the scope, costs, handoff and tests before launch. Setup is a separate fee, quoted for that scope. When a system is unsure or a transfer goes unanswered, it needs an agreed staff fallback.</p><p>The fit call is 15 minutes. Bring one recent example and the name of the person who handles the next action. No sensitive customer records are needed.</p><p>{campaign.audience === 'dealer' ? <><a href="/industries/used-car-dealers/">Explore the dealer workflow</a> · <a href="/how-it-works/">Our approach</a></> : <a href="/inquire/?source=repair">Ask Gavin about your repair shop</a>}</p></section>
      <footer className="auto-footer"><span>© 2026 Schurr Automations</span><a href="/privacy/">Privacy</a><a href="mailto:gavin@schurrautomations.com">Contact Gavin</a></footer>
    </div>
  </main>;
}
