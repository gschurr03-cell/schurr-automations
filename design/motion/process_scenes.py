"""Distinct, fixed-frame motion studies for operations, approach, and evidence.

Each export returns XML-safe SVG children for a 680 × 460 viewBox. The shared
story controller owns timing, reduced motion, pause, and visibility suspension.
All content is illustrative; the scenes contain no live or invented metrics.
"""

from html import escape


def _text(x, y, value, size=22, color='#eeeaf3', anchor='start', weight=400):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" '
            f'font-family="Archivo,Arial,sans-serif" font-size="{size}" '
            f'font-weight="{weight}" fill="{color}" style="fill:{color};font-weight:{weight}">{escape(value)}</text>')


def _defs(prefix):
    return f'''<defs>
<linearGradient id="{prefix}-proc-face" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#302e35"/><stop offset=".55" stop-color="#211e27"/><stop offset="1" stop-color="#18161c"/></linearGradient>
<linearGradient id="{prefix}-proc-edge" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#c6c8d2"/><stop offset=".28" stop-color="#5e5968"/><stop offset=".72" stop-color="#9b91a5"/><stop offset="1" stop-color="#46404e"/></linearGradient>
<linearGradient id="{prefix}-proc-purple" x1="0" y1="0" x2="1" y2=".25"><stop stop-color="#60369a"/><stop offset=".55" stop-color="#8450bf"/><stop offset="1" stop-color="#b991e5"/></linearGradient>
<filter id="{prefix}-proc-shadow" x="-25%" y="-30%" width="150%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000" flood-opacity=".35"/></filter>
</defs>'''


def _reveal(content, start, end):
    return f'<g data-story-reveal="" data-from="{start}" data-to="{end}" opacity="0">{content}</g>'


def _window(content, start, end, until=2, finish=3, initial=False):
    return (f'<g data-story-window="" data-from="{start}" data-to="{end}" '
            f'data-until="{until}" data-end="{finish}" opacity="{1 if initial else 0}">{content}</g>')


def _motion(content, start, end, x1=0, x2=0, y1=0, y2=0, scale1=1, scale2=1):
    return (f'<g data-story-motion="" data-from="{start}" data-to="{end}" '
            f'data-from-x="{x1}" data-to-x="{x2}" data-from-y="{y1}" data-to-y="{y2}" '
            f'data-from-scale="{scale1}" data-to-scale="{scale2}" '
            f'transform="translate({x1} {y1}) scale({scale1})">{content}</g>')


def _trace(prefix, key, d, start, end, width=2):
    return (f'<path d="{d}" fill="none" stroke="#49404f" stroke-width="1"/>'
            f'<path id="{prefix}-{key}" d="{d}" fill="none" stroke="#b991e5" '
            f'stroke-width="{width}" stroke-linecap="round" pathLength="1" '
            f'data-story-trace="" data-from="{start}" data-to="{end}" '
            f'stroke-dasharray="1" stroke-dashoffset="1"/>')


def _check(x, y, start, end):
    return _reveal(f'<circle cx="{x}" cy="{y}" r="11" fill="#392746" stroke="#a97ad0" stroke-width="1"/>'
                   f'<path d="M{x-5} {y}l3.5 4 6.5-8" fill="none" stroke="#e2c8f5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', start, end)


def automation(prefix):
    """One transaction drives three aligned record lanes, then settles in sync."""
    art = _defs(prefix)
    art += _text(34, 46, 'One request. Every record.', 25, weight=500)
    # A physical transaction strip, followed by a wide operational ledger.
    art += f'<path d="M34 82H634L646 94V138H34Z" fill="url(#{prefix}-proc-face)" stroke="url(#{prefix}-proc-edge)" stroke-width="1.2"/>'
    art += '<path d="M56 103h12m-12 7h12m-12 7h7" stroke="#c6c8d2" stroke-width="1.6"/>'
    art += _text(84, 118, 'Customer request', 23)
    art += _window(_text(614, 118, 'Received', 18, '#c2b8cb', 'end'), 0, .01, .30, .38, True)
    art += _window(_text(614, 118, 'Processing', 18, '#cba8e9', 'end'), .31, .39, .67, .75)
    art += _reveal(_text(614, 118, 'In sync', 18, '#d7b8ef', 'end'), .76, .85)
    art += '<path d="M34 168H646M34 240H646M34 312H646M34 384H646" stroke="#4d4356" stroke-width=".85"/>'
    art += '<path d="M414 168V384" stroke="#403646" stroke-width=".7"/>'
    art += _trace(prefix, 'sync-bus', 'M67 139V345', .31, .64, 1.8)
    rows = [(204, 'Customer record', 'Updated', .34, .48),
            (276, 'Next action', 'Prepared', .45, .61),
            (348, 'Team context', 'Shared', .57, .73)]
    for i, (y, label, state, start, end) in enumerate(rows):
        art += _text(119, y+8, label, 22)
        art += f'<path d="M67 {y}H98" stroke="#62516f" stroke-width="1"/>'
        art += _trace(prefix, f'lane-{i}', f'M67 {y}H98', start, end)
        art += f'<circle cx="67" cy="{y}" r="4" fill="#211b29" stroke="#8a779c" stroke-width="1"/>'
        art += _reveal(f'<circle cx="67" cy="{y}" r="4" fill="#b991e5"/>', start, end)
        art += _window(_text(441, y+8, 'Waiting', 21, '#a79bab'), 0, .01, end-.04, end+.03, True)
        art += _reveal(_text(441, y+8, state, 21, '#d5b7ee'), end, end+.08)
        art += _check(613, y+1, end+.02, end+.10)
    art += _reveal('<path d="M34 384H646" stroke="#b991e5" stroke-width="1.5"/>'
                   + _text(34, 427, 'The details stay with the work.', 20, '#c6bcce'), .80, .96)
    return art


def approach(prefix):
    """A written brief becomes a fitted assembly, reviewed before release."""
    art = _defs(prefix)
    # Fixed registration marks establish a drafting surface instead of a graph.
    art += '<path d="M34 97V78H53M627 78H646V97M34 383V402H53M627 402H646V383" fill="none" stroke="#7e718b" stroke-width="1.2"/>'
    art += '<path d="M340 78V402M34 240H646" fill="none" stroke="#332d3b" stroke-width=".8" stroke-dasharray="3 7"/>'
    art += _window(_text(34, 46, 'Start with a clear brief.', 25, weight=500), 0, .01, .29, .36, True)
    art += _window(_text(34, 46, 'Build every part to fit.', 25, weight=500), .32, .39, .67, .74)
    art += _reveal(_text(34, 46, 'Review. Then release.', 25, weight=500), .71, .79)

    brief = f'<path d="M144 108H513L536 131V368H144Z" fill="url(#{prefix}-proc-face)" stroke="url(#{prefix}-proc-edge)" stroke-width="1.1"/>'
    brief += '<path d="M513 108V131H536" fill="none" stroke="#918497" stroke-width="1"/>'
    for y, label, i in [(159, 'The business goal', 1), (239, 'The working rules', 2), (319, 'The right handoffs', 3)]:
        brief += _text(173, y, f'0{i}', 18, '#b991e5') + _text(219, y, label, 23)
        brief += f'<path d="M219 {y+20}H492" stroke="#74667e" stroke-width="1"/>'
    art += _window(brief, 0, .08, .28, .37, True)

    assembly = '<path d="M100 142H580M100 316H580M115 124V334M565 124V334" fill="none" stroke="#54465e" stroke-width=".8"/>'
    assembly += '<path d="M123 156H557V302H123Z" fill="none" stroke="#b5a9c1" stroke-width="1" stroke-dasharray="4 7"/>'
    # Three individually fitted plates form a coherent chassis. No floating icons.
    for i, (x, w, title, from_x, start) in enumerate([(127, 126, 'Input', -28, .37), (261, 158, 'Rules', 0, .43), (427, 126, 'Handoff', 28, .49)]):
        module = f'<path d="M{x} 173L{x+9} 164H{x+w-9}L{x+w} 173V285L{x+w-9} 294H{x+9}L{x} 285Z" fill="url(#{prefix}-proc-face)" stroke="url(#{prefix}-proc-edge)" stroke-width="1.2"/>'
        module += f'<path d="M{x+12} 175H{x+w-12}" stroke="#e4dce9" stroke-opacity=".14" stroke-width="1"/>'
        module += _text(x+w/2, 214, f'0{i+1}', 18, '#b991e5', 'middle')
        module += _text(x+w/2, 252, title, 22, '#eeeaf3', 'middle')
        assembly += _reveal(_motion(module, start, start+.10, x1=from_x, y1=-16 if i==1 else 8), start-.02, start+.05)
    assembly += _trace(prefix, 'fitting-line', 'M140 329H540', .54, .63, 1.2)
    assembly += '<path d="M140 324V334M540 324V334" stroke="#b991e5" stroke-width="1"/>'
    assembly += _window(_text(340, 369, 'Built around the agreed process', 20, '#c6bcce', 'middle'), .48, .58, .68, .76)
    art += _reveal(assembly, .32, .40)

    # The same assembly is checked; it never turns into a different node diagram.
    art += _reveal(_trace(prefix, 'release-frame', 'M115 154V132H565V154M115 302V344H565V302', .73, .90, 1.5), .71, .76)
    for x, label, start in [(151, 'Scenarios', .73), (334, 'Handoffs', .81), (511, 'Launch', .88)]:
        art += _check(x-15, 380, start, start+.06)
        art += _reveal(_text(x+5, 387, label, 18, '#d8c5e6'), start+.02, start+.08)
    art += _reveal(_text(340, 438, 'Check the complete experience together.', 20, '#c6bcce', 'middle'), .91, 1)
    return art


def evidence(prefix):
    """A literal handoff gap is bridged, then framed by agreed measurements."""
    art = _defs(prefix)
    art += _window(_text(34, 46, 'Interest needs a next step.', 25, weight=500), 0, .01, .29, .37, True)
    art += _window(_text(34, 46, 'Close the handoff gap.', 25, weight=500), .33, .40, .67, .75)
    art += _reveal(_text(34, 46, 'Measure what changes.', 25, weight=500), .71, .79)
    art += _text(55, 121, 'Inquiry', 24) + _text(626, 121, 'Next step', 24, anchor='end')

    # Two cantilevered planes end at a visible seam. The bridge is the motion.
    art += f'<path d="M35 151H254L274 171V264H35Z" fill="url(#{prefix}-proc-face)" stroke="url(#{prefix}-proc-edge)" stroke-width="1.2"/>'
    art += f'<path d="M406 171L426 151H645V264H406Z" fill="url(#{prefix}-proc-face)" stroke="url(#{prefix}-proc-edge)" stroke-width="1.2"/>'
    art += '<path d="M35 264V274H274V264M406 264V274H645V264" fill="#111014" stroke="#49404f" stroke-width=".8"/>'
    art += '<path d="M295 150V276M385 150V276" stroke="#51465b" stroke-width=".8" stroke-dasharray="3 6"/>'
    for i,y in enumerate([184,211,238]):
        art += _trace(prefix, f'arrival-{i}', f'M55 {y}H246', .015+i*.045, .13+i*.055, 1.5)
        art += f'<path d="M434 {y}H625" stroke="#53475d" stroke-width="1"/>'
    art += _window(_text(340, 310, 'The gap', 22, '#bba9c8', 'middle'), 0, .06, .34, .44, True)
    # Inset metallic bridge spans the empty space; thin amethyst tracks connect.
    bridge = f'<path d="M254 178H426V245H254Z" fill="url(#{prefix}-proc-purple)" fill-opacity=".23" stroke="#a683c1" stroke-width="1"/>'
    bridge += '<path d="M258 179H422" stroke="#e2c8f5" stroke-opacity=".4" stroke-width="1"/>'
    art += _reveal(_motion(bridge, .33, .46, y1=19), .32, .42)
    for i,y in enumerate([184,211,238]):
        art += _reveal(_trace(prefix, f'bridge-{i}', f'M246 {y}H625', .39+i*.047, .53+i*.055, 1.8), .36, .40)
    art += _window(_text(340, 310, 'A deliberate next action', 22, '#d4b3ed', 'middle'), .47, .57, .68, .77)

    # Measurement is a plan, not a fabricated performance chart.
    measure = '<path d="M55 289V310H625V289M340 310V337" stroke="#9573ad" stroke-width="1.1" fill="none"/>'
    measure += _text(34, 370, 'Response time', 22, '#eeeaf3')
    measure += _text(646, 370, 'Completed handoffs', 22, '#eeeaf3', 'end')
    measure += '<path d="M34 385H646" stroke="#4f435c" stroke-width=".8"/>'
    measure += _text(340, 426, 'Agree a baseline. Review your result.', 20, '#c6bcce', 'middle')
    art += _reveal(measure, .76, .92)
    return art
