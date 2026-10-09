"""Build I1 vector diagrams and PNGs. Requires PyMuPDF and Pillow."""
from pathlib import Path
from html import escape
import math
import fitz

OUT = Path(__file__).resolve().parents[1] / 'wiki' / 'images'
INK, GREEN, LIGHT, GRAY = '#18352d', '#23674d', '#eff6f1', '#697b74'


class Figure:
    def __init__(self, title, height):
        self.height = height
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="{height}" viewBox="0 0 1100 {height}">',
                      '<rect width="1100" height="100%" fill="white"/>']
        self.text(28, 40, title, 25, True)

    def text(self, x, y, value, size=18, bold=False, color=INK):
        self.parts.append(f'<text x="{x}" y="{y}" font-family="Arial, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(value)}</text>')

    def box(self, x, y, w, title, lines, h=None, dashed=False):
        h = h or 62 + 25 * len(lines)
        dash = ' stroke-dasharray="8 5"' if dashed else ''
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{LIGHT}" stroke="{GREEN}" stroke-width="2"{dash}/>')
        self.text(x + 15, y + 29, title, 21, True)
        for i, line in enumerate(lines):
            self.text(x + 15, y + 57 + i * 25, line)

    def arrow(self, points, label=None, lx=None, ly=None, dashed=False):
        pts = ' '.join(f'{x},{y}' for x, y in points)
        dash = ' stroke-dasharray="7 5"' if dashed else ''
        self.parts.append(f'<polyline points="{pts}" fill="none" stroke="{GRAY}" stroke-width="2.4"{dash}/>')
        x, y = points[-1]
        px, py = points[-2]
        a = math.atan2(y - py, x - px)
        tip = [(x, y), (x - 11 * math.cos(a) + 5 * math.sin(a), y - 11 * math.sin(a) - 5 * math.cos(a)),
               (x - 11 * math.cos(a) - 5 * math.sin(a), y - 11 * math.sin(a) + 5 * math.cos(a))]
        self.parts.append(f'<polygon points="{" ".join(f"{u},{v}" for u,v in tip)}" fill="{GRAY}"/>')
        if label:
            self.text(lx, ly, label, 17, color=GRAY)

    def save(self, name):
        OUT.mkdir(parents=True, exist_ok=True)
        svg = '\n'.join(self.parts + ['</svg>'])
        (OUT / f'i1-{name}.svg').write_text(svg, encoding='utf-8')
        with fitz.open(stream=svg.encode(), filetype='svg') as source:
            with fitz.open('pdf', source.convert_to_pdf()) as pdf:
                pdf[0].get_pixmap(matrix=fitz.Matrix(2, 2)).save(OUT / f'i1-{name}.png')


def architecture():
    f = Figure('Farmclub / application boundaries', 690)
    f.box(30, 85, 320, 'Consumer web', ['Discover / reserve / orders', 'News rooms / private support'])
    f.box(750, 85, 320, 'Producer web', ['Catalog / demand / shipping', 'News / replies / AI settings'])
    f.box(390, 90, 320, 'Shared packages', ['UI components + typed API', 'App-specific token storage'])
    f.arrow([(350, 139), (390, 139)])
    f.arrow([(750, 139), (710, 139)])
    f.arrow([(550, 202), (550, 280)], 'REST / JSON + bearer token', 570, 246)
    f.box(260, 280, 580, 'FastAPI / authorization + domain services', ['Accounts / farms / catalog / orders / messaging', 'Validation, ownership, transactions, AI adapter'], 122)
    f.box(30, 490, 450, 'PostgreSQL 16', ['SQLAlchemy sessions + Alembic', 'Orders, messages, private bytes, replay records'])
    f.box(650, 490, 420, 'Claude / optional server call', ['Anthropic SDK, no client credentials', 'Rules, structured validation and fallback'])
    f.arrow([(405, 402), (405, 448), (255, 448), (255, 490)], 'SQL', 276, 438)
    f.arrow([(695, 402), (695, 448), (860, 448), (860, 490)], 'Conditional HTTPS', 867, 450)
    f.text(30, 655, 'Deployment plan: Vercel + Railway. Planned integrations: R2, PostHog, Sentry, Langfuse.', 18)
    f.save('architecture')


def journey():
    f = Figure('Farmclub / user journey and recovery', 850)
    f.text(30, 82, 'CONSUMER', 17, True, GREEN)
    f.box(30, 110, 240, 'Discover', ['Farm / product', 'Read quality and timing'])
    f.box(300, 110, 240, 'Select', ['Option + quantity', 'Reserve action'])
    f.box(570, 110, 240, 'Checkout', ['Recipient + 4 consents', 'Review current terms'])
    f.box(840, 110, 230, 'Pay (mock)', ['Success: RESERVED', 'No double allocation'])
    for x in [270, 540, 810]:
        f.arrow([(x, 158), (x+30, 158)])
    f.box(300, 320, 240, 'Login if needed', ['Consumer test account', 'Return with selection'])
    f.arrow([(420, 222), (420, 320)], 'Protected action', 435, 281)
    f.arrow([(540, 376), (690, 376), (690, 222)], 'Return', 606, 363)
    f.box(840, 320, 230, 'Recover / retry', ['Failure: no allocation', 'Changed terms: review'])
    f.arrow([(955, 222), (955, 320)], 'Failure / conflict', 826, 279)
    f.arrow([(840, 349), (770, 349), (770, 222)])
    f.text(30, 502, 'PRODUCER', 17, True, GREEN)
    f.box(30, 530, 240, 'Prepare', ['Application / profile', 'Draft and edit product'])
    f.box(300, 530, 240, 'Approve supply', ['Operator decision', 'Set sales limit / periods'])
    f.box(570, 530, 240, 'Manage demand', ['Paid reservations', 'Start harvest'])
    f.box(840, 530, 230, 'Ship', ['PREPARING required', 'Confirm shipment'])
    for x in [270, 540, 810]:
        f.arrow([(x, 578), (x+30, 578)])
    f.arrow([(420, 642), (420, 715), (150, 715), (150, 642)], 'Rejected: revise and resubmit', 102, 750)
    f.text(570, 705, 'Consumer: delivered order -> confirmation', 18)
    f.text(570, 739, 'Unshipped cancellation -> refund + one release', 18)
    f.text(30, 809, 'At the farm: follow -> news / private chat. Sensitive or uncertain AI questions -> producer.', 18)
    f.save('user-flow')


def payment():
    f = Figure('Reservation / payment sequence', 780)
    xs = [145, 415, 685, 955]
    for x, title in zip(xs, ['Consumer', 'Orders service', 'Catalog / locks', 'PostgreSQL']):
        f.box(x-110, 75, 220, title, [], 52)
        f.parts.append(f'<line x1="{x}" y1="127" x2="{x}" y2="695" stroke="#bacbc3" stroke-dasharray="6 6"/>')
    steps = [(145,415,180,'1  Create order: selection, address, consents'),
             (415,955,250,'2  Validate + write PENDING_PAYMENT snapshot; no stock hold'),
             (145,415,330,'3  Pay with Idempotency-Key'),
             (415,685,405,'4  Lock product / period-option; recheck terms + capacity'),
             (685,955,480,'5  Write payment + RESERVED + stock'),
             (955,415,565,'6  Commit result and idempotent response'),
             (415,145,640,'7  Return order confirmation')]
    for a,b,y,label in steps:
        f.text(min(a,b)+10, y-13, label, 18)
        f.arrow([(a,y),(b,y)])
    f.text(30, 732, 'Conflict or mock failure: no allocation. An identical key/body replays the stored response.', 18)
    f.save('payment-flow')


def commerce():
    f = Figure('Commerce / principal database relationships', 1070)
    f.box(35, 80, 300, 'User', ['PK id', 'UK (kakao_id, role)'])
    f.box(405, 80, 290, 'Farm', ['PK id', 'FK / UK producer_id'])
    f.box(765, 80, 300, 'ShippingAddress', ['PK id; FK user_id', 'Recipient / address values'])
    f.arrow([(335,126),(405,126)], '0..1', 347, 115)
    f.arrow([(185,80),(185,60),(915,60),(915,80)], '0..N addresses per user', 643, 53)
    f.box(405, 280, 290, 'Product', ['PK id; FK farm_id', 'Capacity + version'])
    f.arrow([(550,192),(550,280)], '0..N', 566, 241)
    f.box(35, 480, 300, 'ProductOption', ['PK (product_id, id)', 'Weight / label'])
    f.box(405, 480, 290, 'Stage', ['PK id; FK product_id', 'Inclusive start / end dates'])
    f.box(765, 480, 300, 'CapacityRequest', ['PK id; FK product_id', 'Initial / increase decisions'])
    f.arrow([(455,392),(455,432),(185,432),(185,480)], '0..N', 233, 423)
    f.arrow([(550,392),(550,480)], '0..N', 566, 445)
    f.arrow([(645,392),(645,432),(915,432),(915,480)], '0..N', 855, 423)
    f.box(35, 690, 440, 'StagePrice / StageAllocation', ['PK (stage_id, option_id)', 'FK stage; composite FK product + option'])
    f.arrow([(185,592),(185,690)], '0..N', 201, 642)
    f.arrow([(550,592),(550,645),(410,645),(410,690)], '0..N', 446, 634)
    f.box(625, 690, 440, 'Order', ['PK id; UK order_no; FK consumer_id', 'FK stage; composite FK product + option', 'Paid price / weight / address snapshots'])
    f.box(625, 910, 440, 'Payment', ['PK id; FK / UK order_id; MOCK provider'], 89)
    f.arrow([(845,827),(845,910)], '0..1 payment per order', 860, 875)
    f.text(35, 897, 'Each order references one buyer, stage and option.', 18)
    f.text(35, 928, 'User/product/option can have 0..N orders.', 18)
    f.text(35, 959, 'Order addresses are copied, not linked to saved rows.', 18)
    f.text(35, 1037, 'Also stored: Follow (consumer + farm), ProductDraft (farm), IdempotencyRecord (user + scope + key).', 18)
    f.save('commerce-erd')


def messaging():
    f = Figure('Communication / principal database relationships', 1030)
    f.box(40,80,440,'Farm', ['PK id; unique producer owner'])
    f.box(620,80,440,'User (consumer)', ['PK id; participant / uploader'])
    f.box(40,285,440,'Broadcast', ['PK id; FK farm_id', 'Visibility / body / media'])
    f.box(620,285,440,'Thread', ['PK id; FK farm_id, consumer_id', 'UK (farm_id, consumer_id)', 'AUTO / HUMAN; mode version'])
    f.arrow([(260,167),(260,285)], '0..N', 276, 232)
    f.arrow([(840,167),(840,285)], '0..N', 856, 232)
    f.arrow([(480,123),(550,123),(550,325),(620,325)], '0..N', 551, 258)
    f.box(40,520,440,'Reaction', ['PK (broadcast_id, user_id)', 'Both columns are FKs'])
    f.box(620,520,440,'ThreadMessage', ['PK id; FK thread_id; UK sequence', 'Sender / evidence / attachments'])
    f.arrow([(260,397),(260,520)], '0..N', 276, 466)
    f.arrow([(840,422),(840,520)], '0..N', 856, 471)
    f.box(40,745,440,'RoomReply', ['PK id; FK farm_id, consumer_id', 'Separate private room replies'])
    f.box(620,745,440,'Escalation / OrderInquiry', ['PK id; FK thread_id, message_id', 'Inquiry also has FK order_id'])
    f.arrow([(840,632),(840,745)], '0..N linked records', 856, 693)
    f.text(40, 910, 'FarmAiSettings: farm PK + version. History: farm/version snapshots.', 18)
    f.text(40, 944, 'PrivateAttachment: uploader FK; order/thread IDs checked by services; bytes stored privately.', 18)
    f.text(40, 978, 'RoomReply and ThreadMessage are different tables and visibility domains.', 18)
    f.save('messaging-erd')


if __name__ == '__main__':
    architecture()
    journey()
    payment()
    commerce()
    messaging()
    print(f'Wrote five SVG/PNG diagram pairs to {OUT}')
