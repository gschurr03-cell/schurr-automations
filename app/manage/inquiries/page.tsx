import { chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { listInquiries } from '@/lib/inquiries';
import { requireOwner } from '@/lib/owner';
import '../owner.css';

export const dynamic = 'force-dynamic';

function displayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}

function serviceName(value: string): string {
  const names: Record<string, string> = {
    calls: 'AI receptionist & lead response',
    leads: 'Lead response',
    website: 'Websites & chatbots',
    reviews: 'Local SEO & Google reviews',
    marketing: 'Marketing',
    brain: 'Company knowledge',
    coding: 'Custom software & workflow automation',
    audit: 'Chatbot integration & auditing',
    time: 'Save time',
    growth: 'Business growth',
    general: 'General inquiry',
  };
  return names[value] ?? value;
}

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
  const access = await requireOwner('/manage/inquiries');
  let inquiries: Awaited<ReturnType<typeof listInquiries>>['items'] = [];
  let nextCursor: string | null = null;
  let failed = false;

  if (access.allowed) {
    try {
      const result = await listInquiries(cursor);
      inquiries = result.items;
      nextCursor = result.nextCursor;
    } catch {
      failed = true;
    }
  }

  return (
    <div className="owner-page">
      <a className="owner-skip" href="#owner-content">Skip to content</a>
      <header className="owner-header">
        <a className="owner-brand" href="/" aria-label="Schurr Automations home">
          <span className="owner-brand-mark" aria-hidden="true">SA</span>
          <span>Schurr Automations<span className="owner-brand-caption">Owner workspace</span></span>
        </a>
        <nav className="owner-nav" aria-label="Owner navigation">
          <a href="/manage">CRM dashboard</a>
          <a href="/manage/inquiries" aria-current="page">Inquiries</a>
          <a href="/manage/metrics">Metrics</a>
          <a className="owner-signout" href={chatGPTSignOutPath('/')}>Sign out</a>
        </nav>
      </header>

      <main className="owner-main" id="owner-content" tabIndex={-1}>
        <div className="owner-heading">
          <p className="owner-eyebrow">Private · Owner access</p>
          <h1>Inquiry inbox</h1>
          <p className="owner-intro">Original website inquiries. Open a record in your CRM to update its stage, add notes, or schedule a follow-up.</p>
        </div>

        {!access.allowed ? (
          <section className="owner-state" aria-labelledby="access-heading">
            <span className="owner-state-icon" aria-hidden="true">↗</span>
            <h2 id="access-heading">{access.configured ? 'This account does not have access' : 'Owner access is not configured'}</h2>
            <p>{access.configured
              ? 'This workspace is available only to the approved owner account. Sign out to use a different account.'
              : 'The owner workspace is unavailable until its approved account has been configured.'}</p>
            <a className="owner-button" href={access.configured ? chatGPTSignOutPath('/') : '/'}>
              {access.configured ? 'Sign out' : 'Return home'}
            </a>
          </section>
        ) : failed ? (
          <section className="owner-state" aria-labelledby="error-heading">
            <h2 id="error-heading">The inbox could not load</h2>
            <p>Please try again in a moment. Inquiry details are temporarily unavailable.</p>
            <a className="owner-button" href="/manage/inquiries">Try again</a>
          </section>
        ) : (
          <>
            <div className="owner-list-heading">
              <h2>Latest inquiries <span className="owner-count">{inquiries.length}</span></h2>
              <p>Up to 100 submissions · Newest first</p>
            </div>
            {inquiries.length === 0 ? (
              <section className="owner-state" aria-labelledby="empty-heading">
                <span className="owner-state-icon" aria-hidden="true">↗</span>
                <h2 id="empty-heading">No inquiries yet</h2>
                <p>When someone submits a project request, their message and reply details will appear here.</p>
              </section>
            ) : (
              <ol className="owner-inquiries" aria-label="Latest inquiries">
                {inquiries.map((inquiry) => (
                  <li key={inquiry.id}>
                    <article className="owner-inquiry" aria-labelledby={`inquiry-${inquiry.id}`}>
                      <div className="owner-inquiry-heading">
                        <div>
                          <p className="owner-service">{serviceName(inquiry.service)}</p>
                          <h3 id={`inquiry-${inquiry.id}`}>{inquiry.name}</h3>
                          {inquiry.business && <p className="owner-business">{inquiry.business}</p>}
                        </div>
                        <time className="owner-date" dateTime={inquiry.createdAt}>{displayDate(inquiry.createdAt)}</time>
                      </div>
                      <p className="owner-message">{inquiry.message}</p>
                      <dl className="owner-contact">
                        <div>
                          <dt>Preferred reply</dt>
                          <dd>{inquiry.preferredContact === 'phone' ? 'Phone' : inquiry.preferredContact === 'text' ? 'Text message' : 'Email'}</dd>
                        </div>
                        {inquiry.email && <div>
                          <dt>Email</dt>
                          <dd><a href={`mailto:${encodeURIComponent(inquiry.email)}`}>{inquiry.email}</a></dd>
                        </div>}
                        {inquiry.phone && <div>
                          <dt>Phone</dt>
                          <dd><a href={`tel:${inquiry.phone.replace(/[^\d+]/g, '')}`}>{inquiry.phone}</a></dd>
                        </div>}
                      </dl>
                      <p className="owner-consent">Reference: {inquiry.id}</p>
                      <p className="owner-consent">Contact consent recorded <time dateTime={inquiry.consentAt}>{displayDate(inquiry.consentAt)}</time>.</p>
                      <a className="owner-button" href={`/manage/leads/${inquiry.id}`}>Manage in CRM</a>
                    </article>
                  </li>
                ))}
              </ol>
            )}
            <nav className="owner-nav" aria-label="Inbox pages">
              {cursor && <a href="/manage/inquiries">Latest inquiries</a>}
              {nextCursor && <a href={`/manage/inquiries?cursor=${encodeURIComponent(nextCursor)}`}>Older inquiries</a>}
            </nav>
            <p className="owner-footnote">Submissions are saved here for review; they do not trigger an email notification.</p>
          </>
        )}
      </main>
      <footer className="owner-footer"><p>Schurr Automations · Private owner workspace</p></footer>
    </div>
  );
}
