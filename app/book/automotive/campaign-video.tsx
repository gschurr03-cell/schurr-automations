'use client';

import { useState } from 'react';
import type { AutomotiveCampaign } from './campaigns';

export default function CampaignVideo({ campaign }: { campaign: AutomotiveCampaign }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const canPlay = campaign.video.enabled && !videoFailed;
  if (!campaign.video.enabled) return <section className="auto-workflow" aria-label="Illustrative workflow">
    <p className="auto-workflow-label">Illustrative workflow</p>
    <ol><li><strong>Request received</strong><span>The caller’s question and callback details are captured.</span></li><li><strong>Staff task assigned</strong><span>A named person receives the request and the next action.</span></li><li><strong>Outcome recorded</strong><span>The team records what happened or follows the agreed exception process.</span></li></ol>
    <p>{campaign.summary}</p>
    <p>This example does not make a call, write to a live CRM or confirm an appointment.</p>
  </section>;

  return (
    <figure className="auto-media" aria-label="How Schurr Automations can help">
      {canPlay ? (
        <video
          controls
          playsInline
          preload="metadata"
          poster={campaign.poster}
          aria-label={`${campaign.label}: an overview of Schurr Automations`}
          onError={() => setVideoFailed(true)}
        >
          <source src={campaign.video.src} type="video/mp4" onError={() => setVideoFailed(true)} />
          {campaign.video.captions && <track kind="captions" src={campaign.video.captions} srcLang="en" label="English" default />}
          <p>{campaign.summary}</p>
        </video>
      ) : (
        <div className={`auto-media-overview${posterFailed ? ' auto-media-no-poster' : ''}`}>
          {!posterFailed && <img src={campaign.poster} width="1600" height="900" alt="" onError={() => setPosterFailed(true)} />}
          {posterFailed && <p>{campaign.summary}</p>}
        </div>
      )}
      <figcaption>
        {videoFailed && <span>The embedded video is unavailable. <a href={campaign.video.src} target="_blank" rel="noopener noreferrer">Open the video directly</a>. </span>}
        {campaign.summary}
      </figcaption>
    </figure>
  );
}
