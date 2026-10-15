import BookingForm from '../booking-form';
import type { AutomotiveAudience, CampaignSource } from './campaigns';

// Keep the old printed/digital anchor while sharing one tested request flow.
export default function RevenueReviewForm({ audience, source }: { audience: AutomotiveAudience; source: CampaignSource }) {
  return <div id="revenue-review" className="auto-fit-request"><BookingForm source={source === 'direct' ? audience : `${audience}-${source}`} /></div>;
}
