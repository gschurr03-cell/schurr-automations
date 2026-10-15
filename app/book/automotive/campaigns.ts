export type AutomotiveAudience = 'repair' | 'dealer';
export type CampaignSource = 'card' | 'hanger' | 'direct';
export type AutomotiveCampaign = {
  audience: AutomotiveAudience;
  label: string;
  headline: string;
  introduction: string;
  summary: string;
  poster: string;
  video: { enabled: boolean; src: string; captions?: string };
};

// Preserve printed QR paths and original media filenames. Existing recordings
// stay available at their original URLs, but are withheld from the revised
// conversion page until their claims and captions receive release review.
export const automotiveCampaigns: Record<AutomotiveAudience, AutomotiveCampaign> = {
  repair: {
    audience: 'repair', label: 'For auto repair businesses',
    headline: 'Give the next repair inquiry a clear next step.',
    introduction: 'Capture the request, get the details to the right person, and make the next callback visible. Start with one gap in your shop’s phone and follow-up process.',
    summary: 'An inquiry is captured, assigned to a staff member, and followed through to a recorded outcome. Your staff confirm estimates, availability and appointments.',
    poster: '/automotive/repair-poster.png',
    video: { enabled: false, src: '/videos/repair-explainer.mp4' },
  },
  dealer: {
    audience: 'dealer', label: 'For independent used-car dealers',
    headline: 'Give every serious vehicle inquiry a clear next step.',
    introduction: 'Capture overflow and after-hours inquiries, get the details to the right salesperson, and keep callbacks visible through a busy day.',
    summary: 'An inquiry is captured, assigned to a salesperson, and followed through to a recorded outcome. Your staff confirm vehicle availability, price and appointments.',
    poster: '/automotive/dealer-poster.png',
    video: { enabled: false, src: '/videos/dealer-explainer.mp4' },
  },
};
export function getAutomotiveCampaign(value: string | string[] | undefined): AutomotiveCampaign | null {
  if (value !== 'repair' && value !== 'dealer') return null;
  return automotiveCampaigns[value];
}
export function getCampaignSource(value: string | string[] | undefined): CampaignSource {
  return value === 'card' || value === 'hanger' ? value : 'direct';
}
export function campaignMessage(audience: AutomotiveAudience, source: CampaignSource): string {
  const audienceLabel = audience === 'repair' ? 'Auto repair business' : 'Auto dealership';
  const sourceLabel = { card: 'Business card', hanger: 'Door hanger', direct: 'Direct visit' }[source];
  return `Campaign: ${audienceLabel}\nSource: ${sourceLabel}\nRequest: A 15-minute fit call with Gavin about our inquiry and callback workflow. Please call to arrange a time. No appointment is confirmed.`;
}
