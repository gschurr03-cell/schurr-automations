import BookingForm from './booking-form';
import './booking.css';
import AutomotiveCampaignPage from './automotive/campaign-page';
import { getAutomotiveCampaign, getCampaignSource } from './automotive/campaigns';
export const metadata = { title: 'Request a 15-minute fit call | Schurr Automations', description: 'Tell Gavin about one bottleneck. Request a 15-minute phone conversation and agree a time together.', alternates: { canonical: 'https://schurrautomations.com/book' } };
type BookingSearchParams = Record<string, string | string[] | undefined>;
export default async function BookPage({ searchParams }: { searchParams: Promise<BookingSearchParams> }) {
  const params = await searchParams;
  const campaign = getAutomotiveCampaign(params.for);
  if (campaign) return <AutomotiveCampaignPage campaign={campaign} source={getCampaignSource(params.via)} />;
  const source = typeof params.source === 'string' && ['dealer', 'dealer-card', 'dealer-hanger'].includes(params.source) ? params.source : 'website';
  const dealer = source !== 'website';
  return <main className="public-booking">
    <header><a href="/"><img className="booking-logo" src="/schurr-fusion-approved.png" width="1254" height="1254" alt="Schurr Automations" /></a><a href="/">Back to website</a></header>
    <div className="booking-intro"><h1>{dealer ? 'Give your next buyer a clear path.' : 'Start with one useful conversation.'}</h1><p>{dealer ? 'Request a 15-minute fit call with Gavin about your dealership. We’ll review where vehicle inquiries or callbacks get stuck, who handles them, and which tools your team uses.' : 'Request a 15-minute fit call with Gavin. We’ll understand the bottleneck, the tools you use, and whether a focused workflow review would help.'}</p></div>
    <BookingForm source={source} />
    <section className="booking-preparation" aria-labelledby="prepare-title"><h2 id="prepare-title">What to bring</h2><p>{dealer ? 'One recent vehicle inquiry and the salesperson responsible for follow-up. No credit documents or sensitive buyer records are needed.' : 'One recent example and the name of the person who handles the next action. No sensitive customer records are needed.'} If a deeper review would help, we’ll arrange a separate 35-minute workflow discovery.</p>
      <details><summary>Will this replace our staff?</summary><p>We start by understanding your team’s responsibilities and where a supported system could make the handoff easier.</p></details>
      <details><summary>Can it work with our tools?</summary><p>We check your tools, access and supported connections before agreeing on a scope. The fit call does not assume an integration is available.</p></details>
      <details><summary>How is the work priced?</summary><p>Setup is a separate fee, quoted for the agreed scope. Your quote also states ongoing management, included usage and optional work. We agree on scope and cost before work begins.</p></details>
    </section>
    <footer><a href="/privacy/">Privacy</a><a href="mailto:gavin@schurrautomations.com">gavin@schurrautomations.com</a></footer>
  </main>;
}
