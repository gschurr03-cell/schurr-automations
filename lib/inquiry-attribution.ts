// Source-linked campaign labels, not verified identity or cross-device attribution.
export const INQUIRY_SOURCES = {
  website: 'Website inquiry',
  dealer: 'Dealer page',
  'dealer-card': 'Dealer business card',
  'dealer-hanger': 'Dealer door hanger',
  repair: 'Repair campaign',
  'repair-card': 'Repair business card',
  'repair-hanger': 'Repair door hanger',
} as const;
export type InquirySource = keyof typeof INQUIRY_SOURCES;
export function isInquirySource(value: unknown): value is InquirySource {
  return typeof value === 'string' && Object.hasOwn(INQUIRY_SOURCES, value);
}
