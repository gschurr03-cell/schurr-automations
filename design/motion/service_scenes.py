"""Four service-specific visual stories in a fixed 680 × 460 viewport.

These are code-native illustrations. Their timing attributes are interpreted by
workflow-stories.js; no independent animation loop runs inside these scenes.
"""
from html import escape


def label(x, y, value, size=22, fill='#eeeaf3', weight=400, anchor='start', tracking=0):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" '
            f'style="font-family:Archivo,Arial,sans-serif;font-size:{size}px;'
            f'font-weight:{weight};fill:{fill};letter-spacing:{tracking}px">{escape(value)}</text>')


def reveal(content, start, end):
    return f'<g data-story-reveal="" data-from="{start}" data-to="{end}" opacity="0">{content}</g>'


def window(content, start, end, until, finish):
    return (f'<g data-story-window="" data-from="{start}" data-to="{end}" '
            f'data-until="{until}" data-end="{finish}" opacity="0">{content}</g>')


def defs(prefix):
    return f'''<defs>
<linearGradient id="{prefix}-s-face" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#29272e"/><stop offset=".52" stop-color="#1c1b20"/><stop offset="1" stop-color="#151419"/></linearGradient>
<linearGradient id="{prefix}-s-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c1bacb"/><stop offset=".25" stop-color="#625d6d"/><stop offset=".6" stop-color="#39343f"/><stop offset="1" stop-color="#93829f"/></linearGradient>
<linearGradient id="{prefix}-s-amethyst" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b991e5"/><stop offset=".48" stop-color="#8450bf"/><stop offset="1" stop-color="#492a68"/></linearGradient>
<linearGradient id="{prefix}-s-platinum" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3f3f7"/><stop offset=".48" stop-color="#bcb6c5"/><stop offset="1" stop-color="#686372"/></linearGradient>
<radialGradient id="{prefix}-s-light"><stop stop-color="#8450bf" stop-opacity=".25"/><stop offset="1" stop-color="#8450bf" stop-opacity="0"/></radialGradient>
<filter id="{prefix}-s-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".34"/></filter>
</defs>'''


def panel(prefix, x, y, w, h, radius=4, fill=None, shadow=False):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" '
            f'fill="{fill or f"url(#{prefix}-s-face)"}" stroke="url(#{prefix}-s-edge)" '
            f'stroke-width="1.2"{f" filter=\"url(#{prefix}-s-shadow)\"" if shadow else ""}/>')


def trace(prefix, key, d, start, end, width=2, packet=False, base=True):
    pid = f'{prefix}-s-{key}'
    art = f'<path d="{d}" fill="none" stroke="#4c4357" stroke-width="{width}"/>' if base else ''
    art += (f'<path id="{pid}" d="{d}" fill="none" stroke="#b991e5" stroke-width="{width}" '
            f'stroke-linejoin="round" stroke-linecap="round" pathLength="1" class="story-trace" '
            f'data-story-trace="" data-from="{start}" data-to="{end}"/>')
    if packet:
        art += (f'<circle r="3" fill="#eee0ff" opacity="0" data-story-packet="" '
                f'data-path="{pid}" data-from="{start}" data-to="{end}"/>')
    return art


def check(x, y, scale=1):
    return (f'<g transform="translate({x} {y}) scale({scale})"><circle r="15" fill="#302039" '
            'stroke="#9e76bd" stroke-width="1"/><path d="M-6 0l4 4 8-9" fill="none" '
            'stroke="#dcc3ee" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>')


def receptionist(prefix):
    """A real conversation is transcribed into a useful record and next step."""
    art = defs(prefix)
    art += '<ellipse cx="340" cy="216" rx="320" ry="216" fill="url(#' + prefix + '-s-light)"/>'
    art += panel(prefix, 40, 44, 600, 130, shadow=True)
    art += label(64, 77, 'THE CONVERSATION', 16, '#c0b5cc', tracking=1.3)
    art += label(616, 77, 'Incoming call', 19, '#d8c5e6', anchor='end')
    wave = 'M64 125H82L87 118 93 136 100 111 107 141 114 119 123 126H143L150 109 157 141 164 102 171 149 178 117 185 133 194 121H216L223 116 230 132 237 90 244 156 251 104 258 143 265 114 272 136 279 124H299L306 106 313 145 320 114 327 130 334 122H354L361 117 368 139 375 102 382 149 389 108 396 133 403 123H425L432 112 439 138 446 103 453 143 460 116 467 127H490L497 120 504 132 511 110 518 142 525 117 532 127H554L561 121 568 129 575 119 582 125H616'
    art += trace(prefix, 'voice', wave, .015, .28, width=1.8, packet=True)
    art += trace(prefix, 'capture', 'M210 174V214', .29, .36, width=1.4, packet=True)
    art += panel(prefix, 40, 214, 350, 176)
    art += label(62, 251, 'Useful details', 25, weight=500)
    art += '<path d="M62 269H368" stroke="#4e4359" stroke-width=".8"/>'
    for i, value in enumerate(['Service request', 'Contact details', 'Availability']):
        y = 297 + 32 * i
        row = f'<path d="M64 {y-6}l4 4 8-9" fill="none" stroke="#b991e5" stroke-width="1.4"/>'
        row += label(89, y, value, 20, '#d1c8d9')
        art += reveal(row, .35 + i*.065, .44 + i*.065)
    art += trace(prefix, 'arrange', 'M390 302H418', .64, .73, width=1.5, packet=True)
    art += panel(prefix, 418, 214, 222, 176)
    art += label(440, 251, 'Next step', 25, weight=500)
    result = check(455, 291)
    result += label(440, 338, 'Appointment', 22, '#e3d3ef')
    result += label(440, 365, 'arranged', 22, '#e3d3ef')
    art += reveal(result, .74, .92)
    footer = label(340, 427, 'The context comes with the call.', 20, '#bfb2cb', anchor='middle')
    art += reveal(footer, .83, .97)
    return art


def website(prefix):
    """A browser composition builds, then its call to action creates an inquiry."""
    art = defs(prefix)
    art += panel(prefix, 40, 36, 600, 316, radius=6, shadow=True)
    art += '<path d="M40 78H640" stroke="#615768" stroke-width=".9"/>'
    for x in [61, 75, 89]:
        art += f'<circle cx="{x}" cy="57" r="3" fill="#766980"/>'
    art += label(340, 63, 'YOUR WEBSITE', 15, '#c1b4cc', anchor='middle', tracking=1.6)
    art += '<path d="M69 102H134M70 132H321M70 169H289M70 204H313M70 239H252M388 103H610V250H388Z M69 288H609" fill="none" stroke="#41394a" stroke-width="1"/>'
    art += trace(prefix, 'layout', 'M69 102H134M70 132H321M70 169H289M70 204H313M70 239H252M388 103H610V250H388Z M69 288H609', .015, .21, width=1, base=False)
    page = '<rect x="62" y="89" width="565" height="258" fill="#1a181f"/>'
    page += label(76, 111, 'YOUR BUSINESS', 15, '#bfaccf', tracking=1.4)
    page += label(76, 158, 'Clear purpose.', 27, '#f2eef6', 500)
    page += label(76, 193, 'Confident design.', 27, '#f2eef6', 500)
    page += label(76, 235, 'Built around your customer.', 18, '#c3b5cf')
    page += '<path d="M76 272H603" stroke="#54455e" stroke-width=".9"/>'
    page += label(76, 309, 'One clear next step.', 23, '#e8e1ef')
    page += label(76, 338, 'A reason to get in touch.', 18, '#c3b5cf')
    # A deliberately designed abstract hero asset: three machined sheets.
    page += '<g transform="translate(500 177)">'
    page += f'<ellipse cx="0" cy="19" rx="93" ry="88" fill="url(#{prefix}-s-light)"/>'
    page += f'<path d="M-72-30L13-60 79-19-6 14Z M-72-30V-23L-6 21 79-12V-19M-6 14V21" fill="url(#{prefix}-s-platinum)" stroke="#c0b8ca" stroke-width=".7"/>'
    page += f'<path d="M-72-8L13-38 79 3-6 36Z M-72-8V-1L-6 43 79 10V3M-6 36V43" fill="url(#{prefix}-s-amethyst)" stroke="#b491d0" stroke-width=".7"/>'
    page += f'<path d="M-72 14L13-16 79 25-6 58Z M-72 14V21L-6 65 79 32V25M-6 58V65" fill="url(#{prefix}-s-face)" stroke="#918497" stroke-width=".7"/>'
    page += '</g>'
    page += '<rect x="428" y="298" width="178" height="44" rx="2" fill="#70439f" stroke="#aa80c9" stroke-width=".8"/>'
    page += label(449, 327, 'Inquire', 21, '#f5edf9', 500)
    page += '<path d="M564 321H585M579 315l6 6-6 6" fill="none" stroke="#e3cdef" stroke-width="1.3"/>'
    art += reveal(page, .19, .31)
    cursor = '<path d="M0 0L6 28 12 18 24 18Z" fill="#ece7f2" stroke="#231b2a" stroke-width="1.4"/>'
    cursor = (f'<g data-story-motion="" data-from=".34" data-to=".62" data-from-x="604" '
              f'data-to-x="535" data-from-y="368" data-to-y="323">{cursor}</g>')
    art += window(cursor, .32, .37, .63, .71)
    receipt = panel(prefix, 251, 366, 389, 74, radius=4, shadow=True)
    receipt += '<path d="M251 368H640" stroke="#a879cf" stroke-width="2"/>'
    receipt += check(279, 390, .8)
    receipt += label(304, 398, 'New inquiry', 25, '#eee6f6', 500)
    receipt += label(276, 424, 'Ready for a personal reply.', 19, '#bdb0ca')
    receipt = (f'<g data-story-motion="" data-from=".7" data-to=".88" data-from-y="14" '
               f'data-to-y="0">{receipt}</g>')
    art += reveal(receipt, .7, .85)
    return art


def search(prefix):
    """Search intent locates a useful business answer in an abstract street map."""
    art = defs(prefix)
    art += panel(prefix, 40, 36, 600, 57, radius=4, shadow=True)
    art += '<circle cx="68" cy="62" r="8" fill="none" stroke="#b9a2ca" stroke-width="1.6"/><path d="M74 68l7 7" stroke="#b9a2ca" stroke-width="1.6"/>'
    art += label(99, 72, 'A service. A location.', 24, '#ece7f1', 500)
    art += '<path d="M606 55l9 9-9 9" fill="none" stroke="#a58ab9" stroke-width="1.4"/>'
    # Cropped blocks and arterial routes suggest place without claiming a real map.
    art += '<g stroke="#39333f" stroke-width="1" fill="#1c1921">'
    for points in ['60,120 191,120 177,181 60,192', '211,120 334,120 363,181 198,180',
                   '359,120 470,120 442,180 382,181', '492,120 624,120 624,177 468,178',
                   '60,217 171,208 150,296 60,316', '203,203 370,203 396,274 181,290',
                   '398,200 431,200 398,267', '459,202 624,200 624,284 431,272',
                   '62,340 144,321 130,372 62,372', '177,316 398,299 426,372 163,372',
                   '432,296 624,308 624,372 454,372']:
        art += f'<polygon points="{points}"/>'
    art += '</g>'
    art += '<path d="M49 206L629 189M150 380L203 109M340 112L447 382M451 184L484 112M413 282L635 300" fill="none" stroke="#4d4357" stroke-width="2.5"/>'
    art += trace(prefix, 'discovery', 'M203 115L186 192H459Q489 192 489 221', .015, .27, width=2, packet=True)
    pin = f'<circle cx="489" cy="234" r="49" fill="url(#{prefix}-s-light)"/>'
    pin += '<ellipse cx="489" cy="236" rx="21" ry="6" fill="#8450bf" fill-opacity=".18" stroke="#8450bf" stroke-opacity=".3"/>'
    pin += f'<path d="M489 233C479 219 466 206 466 193a23 23 0 0 1 46 0c0 13-13 26-23 40Z" fill="url(#{prefix}-s-amethyst)" stroke="#c3a5d9" stroke-width="1.1"/>'
    pin += '<circle cx="489" cy="193" r="7" fill="#271b32" stroke="#c19fdd" stroke-width=".8"/>'
    pin += label(489, 272, 'Your business', 22, '#e2d3ed', 500, anchor='middle')
    art += reveal(pin, .11, .28)
    listing = panel(prefix, 55, 158, 289, 212, radius=4, shadow=True)
    listing += label(78, 193, 'A useful answer.', 25, '#f0e8f6', 500)
    listing += '<path d="M78 211H321" stroke="#4f425c" stroke-width=".8"/>'
    listing += label(78, 243, 'Services & location', 20, '#d5c6e0')
    listing += label(78, 275, 'Hours & contact', 20, '#d5c6e0')
    listing += label(78, 307, 'Real customer reviews', 20, '#d5c6e0')
    listing += '<path d="M78 333H179" stroke="#9062b4" stroke-width="2"/>'
    listing += label(195, 339, 'Get in touch', 18, '#c4a5de')
    art += reveal(listing, .33, .54)
    art += trace(prefix, 'contact', 'M344 338H491V384', .64, .8, width=1.5, packet=True)
    contact = panel(prefix, 232, 384, 408, 48, radius=3, shadow=True)
    contact += check(257, 408, .65)
    contact += label(280, 416, 'Start a conversation', 24, '#ece0f5', 500)
    art += reveal(contact, .79, .95)
    return art


def demo(prefix):
    """A conversational transcript becomes a short, readable team handoff."""
    art = defs(prefix)
    art += label(40, 40, 'A CONVERSATION, WITH CONTEXT', 16, '#c2b2ce', tracking=1.4)
    art += '<path d="M40 58H640" stroke="#4b3d58" stroke-width=".8"/>'
    art += '<path d="M59 99V288" stroke="#4d3e5b" stroke-width="1" stroke-dasharray="2 7"/>'
    # The two speakers have different alignment and identity, not graph nodes.
    caller = '<circle cx="59" cy="99" r="6" fill="#a7a1af" stroke="#d4ccd9" stroke-width=".8"/>'
    caller += label(84, 91, 'CALLER', 15, '#b7a8c4', tracking=1.3)
    caller += label(84, 122, 'Can I arrange a visit?', 25, '#eee8f3', 500)
    art += reveal(caller, 0, .08)
    reply = panel(prefix, 134, 153, 506, 93, radius=3)
    reply += '<path d="M134 157V242" stroke="#9765bf" stroke-width="2"/>'
    reply += label(157, 181, 'RECEPTIONIST', 15, '#b991e5', tracking=1.3)
    reply += label(157, 218, 'What do you need help with?', 23, '#e8d9f2', 500)
    art += reveal(reply, .18, .31)
    answer = '<circle cx="59" cy="286" r="6" fill="#a7a1af" stroke="#d4ccd9" stroke-width=".8"/>'
    answer += label(84, 280, 'CALLER', 15, '#b7a8c4', tracking=1.3)
    answer += label(84, 310, 'A service appointment.', 25, '#eee8f3', 500)
    art += reveal(answer, .39, .53)
    art += trace(prefix, 'handoff', 'M339 320V345', .62, .73, width=1.4, packet=True)
    handoff = panel(prefix, 40, 345, 600, 85, radius=4, shadow=True)
    handoff += check(72, 375, .8)
    handoff += label(100, 383, 'Captured for your team', 25, '#eee5f5', 500)
    handoff += label(100, 412, 'Request · contact details · next step', 20, '#c5b1d6')
    art += reveal(handoff, .73, .91)
    return art


SCENES = {'receptionist': receptionist, 'website': website, 'search': search, 'demo': demo}
