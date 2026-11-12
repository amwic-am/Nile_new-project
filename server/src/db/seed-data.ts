/**
 * Development-only demo content for Nile Mart.
 *
 * This data is inserted by `npm run db:seed` when SEED_DEMO_DATA is enabled and
 * the database contains no products. Production installations must create their
 * own catalogue through the admin dashboard instead.
 *
 * Money is expressed in santim (1 ETB = 100 santim). Percentage coupons use
 * basis points (1000 = 10.00%).
 */

const etb = (amount: number): number => Math.round(amount * 100);

export interface SeedCategory {
  slug: string;
  name: string;
  description: string;
  image?: string;
  children?: Omit<SeedCategory, 'children'>[];
}

export interface SeedBrand {
  name: string;
  slug: string;
  description: string;
  website?: string;
}

export interface SeedSupplier {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes?: string;
}

export interface SeedVariant {
  suffix: string;
  options: Record<string, string>;
  price?: number;
  compareAtPrice?: number;
  stock: number;
  cost?: number;
}

export interface SeedProduct {
  slug: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  shortDescription: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  cost: number;
  featured?: boolean;
  specs: { label: string; value: string }[];
  warranty: string;
  returnInfo: string;
  lowStockThreshold?: number;
  images: string[];
  options?: { name: string; values: string[] }[];
  variants: SeedVariant[];
  soldCount: number;
  viewCount: number;
  supplier: string;
}

export interface SeedStaff {
  email: string;
  name: string;
  phone: string;
  role: string;
}

export interface SeedCustomer {
  email: string;
  name: string;
  phone: string;
  city: string;
  region: string;
  line1: string;
  marketingOptIn?: boolean;
}

export interface SeedReview {
  product: string;
  customer: string;
  rating: number;
  title: string;
  body: string;
  daysAgo: number;
  verified?: boolean;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const categories: SeedCategory[] = [
  {
    slug: 'electronics',
    name: 'Electronics',
    description: 'Audio, wearables and smart devices for everyday life.',
    image: 'lifestyle-coffee',
    children: [
      { slug: 'audio', name: 'Audio', description: 'Headphones, earbuds and speakers.' },
      { slug: 'wearables', name: 'Wearables', description: 'Smartwatches and fitness trackers.' },
      { slug: 'smart-home', name: 'Smart home', description: 'Connected devices for a smarter home.' },
      { slug: 'cameras', name: 'Cameras', description: 'Cameras, lenses and accessories.' },
    ],
  },
  {
    slug: 'phones-accessories',
    name: 'Phones & accessories',
    description: 'Smartphones, charging and protection.',
    children: [
      { slug: 'smartphones', name: 'Smartphones', description: 'Flagship and everyday phones.' },
      { slug: 'chargers-power', name: 'Chargers & power', description: 'Fast chargers and power banks.' },
      { slug: 'cases-protection', name: 'Cases & protection', description: 'Cases, screen guards and sleeves.' },
    ],
  },
  {
    slug: 'computers-accessories',
    name: 'Computers & accessories',
    description: 'Laptops, monitors, peripherals and tablets.',
    children: [
      { slug: 'laptops', name: 'Laptops', description: 'Thin, light and powerful notebooks.' },
      { slug: 'monitors', name: 'Monitors', description: 'Displays for work and play.' },
      { slug: 'keyboards-mice', name: 'Keyboards & mice', description: 'Mechanical keyboards and precision mice.' },
      { slug: 'tablets', name: 'Tablets', description: 'Tablets for work, study and entertainment.' },
    ],
  },
  {
    slug: 'fashion',
    name: 'Fashion',
    description: 'Clothing, shoes and bags for every occasion.',
    children: [
      { slug: 'men', name: 'Men', description: 'Shirts, trousers and essentials.' },
      { slug: 'women', name: 'Women', description: 'Everyday and occasion wear.' },
      { slug: 'shoes', name: 'Shoes', description: 'Sneakers, boots and sandals.' },
      { slug: 'bags', name: 'Bags', description: 'Backpacks, totes and travel bags.' },
    ],
  },
  {
    slug: 'home-living',
    name: 'Home & living',
    description: 'Thoughtful pieces for a calmer home.',
    image: 'lifestyle-coffee',
    children: [
      { slug: 'lighting', name: 'Lighting', description: 'Lamps and warm ambient light.' },
      { slug: 'textiles', name: 'Textiles', description: 'Throws, cushions and bed linen.' },
      { slug: 'furniture', name: 'Furniture', description: 'Chairs, desks and storage.' },
      { slug: 'kitchen-dining', name: 'Kitchen & dining', description: 'Coffee, tea and tableware.' },
    ],
  },
  {
    slug: 'beauty-personal-care',
    name: 'Beauty & personal care',
    description: 'Skincare, haircare and fragrance.',
    image: 'lifestyle-serum',
    children: [
      { slug: 'skincare', name: 'Skincare', description: 'Serums, moisturisers and SPF.' },
      { slug: 'haircare', name: 'Haircare', description: 'Oils, shampoos and treatments.' },
      { slug: 'fragrance', name: 'Fragrance', description: 'Signature scents for day and night.' },
    ],
  },
  {
    slug: 'sports-outdoor',
    name: 'Sports & outdoor',
    description: 'Train, hike and explore further.',
    children: [
      { slug: 'fitness', name: 'Fitness', description: 'Home gym and studio essentials.' },
      { slug: 'outdoor', name: 'Outdoor', description: 'Packs and trail gear.' },
      { slug: 'sportswear', name: 'Sportswear', description: 'Performance apparel.' },
    ],
  },
  {
    slug: 'office-supplies',
    name: 'Office supplies',
    description: 'A workspace that works.',
    children: [
      { slug: 'stationery', name: 'Stationery', description: 'Notebooks, pens and paper.' },
      { slug: 'office-furniture', name: 'Office furniture', description: 'Chairs, desks and storage.' },
      { slug: 'printing', name: 'Printing', description: 'Printers, ink and paper.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Brands and suppliers
// ---------------------------------------------------------------------------

export const brands: SeedBrand[] = [
  { name: 'Lumen', slug: 'lumen', description: 'Connected devices designed in Addis Ababa for everyday life.' },
  { name: 'Vertex', slug: 'vertex', description: 'Workstations, laptops and displays built for focused work.' },
  { name: 'AirTone', slug: 'airtone', description: 'Personal audio tuned for rich, balanced sound.' },
  { name: 'VoltEdge', slug: 'voltedge', description: 'Compact, dependable charging and power.' },
  { name: 'Keystroke', slug: 'keystroke', description: 'Mechanical keyboards for people who type a lot.' },
  { name: 'Sahara', slug: 'sahara', description: 'Full-grain leather goods, made to age beautifully.' },
  { name: 'Merkato Threads', slug: 'merkato-threads', description: 'Everyday wardrobe staples in natural fibres.' },
  { name: 'Rift', slug: 'rift', description: 'Movement-first footwear and training gear.' },
  { name: 'Bunna', slug: 'bunna', description: 'Ethiopian coffee, roasted for the ritual.' },
  { name: 'Kokeb Home', slug: 'kokeb-home', description: 'Considered objects for a warmer home.' },
  { name: 'Glow Lab', slug: 'glow-lab', description: 'Clinically minded skincare with simple formulas.' },
  { name: 'Sente', slug: 'sente', description: 'Fragrance inspired by highland evenings.' },
  { name: 'Quill', slug: 'quill', description: 'Paper, pens and desk tools for clear thinking.' },
];

export const suppliers: SeedSupplier[] = [
  {
    name: 'Abay Electronics Distribution',
    contactName: 'Fikru Desta',
    email: 'fikru@abaydistribution.et',
    phone: '+251 911 214 550',
    address: 'Bole Sub-city, Addis Ababa',
    notes: 'Authorised distributor for Lumen, Vertex and AirTone. Delivers on Mondays and Thursdays.',
  },
  {
    name: 'Sheba Lifestyle Trading',
    contactName: 'Almaz Bekele',
    email: 'almaz@shebalifestyle.et',
    phone: '+251 912 387 104',
    address: 'Kirkos Sub-city, Addis Ababa',
    notes: 'Home, beauty and lifestyle brands. Minimum order 10 units per SKU.',
  },
  {
    name: 'Rift Supply Co.',
    contactName: 'Tewodros Girma',
    email: 'orders@riftsupply.et',
    phone: '+251 913 660 219',
    address: 'Industrial Park, Bishoftu',
    notes: 'Sportswear, footwear and outdoor equipment.',
  },
];

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const products: SeedProduct[] = [
  {
    slug: 'lumen-pulse-x6-pro',
    name: 'Lumen Pulse X6 Pro 5G',
    sku: 'LM-PX6P',
    category: 'smartphones',
    brand: 'lumen',
    shortDescription: 'A bright 6.7-inch 120Hz display, all-day battery and a camera system that loves Ethiopian light.',
    description: `The Pulse X6 Pro is Lumen's most balanced flagship yet. A 6.7-inch LTPO AMOLED display ramps between 1 and 120Hz, so scrolling feels fluid while the battery lasts comfortably into a second day.

The 50MP main camera uses a large sensor and optical stabilisation to keep evening shots across Bole crisp. A 3x telephoto lens handles portraits, and 66W charging refills the 5,000mAh battery in under 40 minutes.

**In the box:** phone, 66W charger, USB-C cable, clear case, SIM tool.`,
    price: etb(62990),
    compareAtPrice: etb(69990),
    cost: etb(51200),
    featured: true,
    specs: [
      { label: 'Display', value: '6.7" LTPO AMOLED, 120Hz' },
      { label: 'Processor', value: 'Lumen L9 octa-core 5G' },
      { label: 'Memory', value: '12GB RAM' },
      { label: 'Storage', value: '128GB or 256GB' },
      { label: 'Rear camera', value: '50MP + 12MP ultrawide + 10MP telephoto' },
      { label: 'Front camera', value: '16MP' },
      { label: 'Battery', value: '5,000mAh, 66W wired' },
      { label: 'Security', value: 'In-display fingerprint, face unlock' },
      { label: 'Network', value: 'Dual SIM 5G' },
    ],
    warranty: '24-month official Lumen warranty covering manufacturing defects.',
    returnInfo: 'Returns accepted within 7 days if unused and sealed, with all accessories.',
    images: ['smartphone-pulse'],
    options: [
      { name: 'Storage', values: ['128GB', '256GB'] },
      { name: 'Colour', values: ['Midnight', 'Glacier'] },
    ],
    variants: [
      { suffix: '128-MID', options: { Storage: '128GB', Colour: 'Midnight' }, stock: 22, cost: etb(51200) },
      { suffix: '128-GLA', options: { Storage: '128GB', Colour: 'Glacier' }, stock: 14, cost: etb(51200) },
      { suffix: '256-MID', options: { Storage: '256GB', Colour: 'Midnight' }, price: etb(70990), compareAtPrice: etb(77990), stock: 9, cost: etb(58100) },
      { suffix: '256-GLA', options: { Storage: '256GB', Colour: 'Glacier' }, price: etb(70990), compareAtPrice: etb(77990), stock: 6, cost: etb(58100) },
    ],
    soldCount: 184,
    viewCount: 4120,
    supplier: 'Abay Electronics Distribution',
  },
  {
    slug: 'airtone-pro-earbuds',
    name: 'AirTone Pro Wireless Earbuds',
    sku: 'AT-APRO',
    category: 'audio',
    brand: 'airtone',
    shortDescription: 'Adaptive noise cancellation, a warm detailed sound and 30 hours with the case.',
    description: `AirTone Pro pairs 11mm drivers with adaptive noise cancellation that reads your environment 200 times a second. Voices stay clear on calls thanks to three beam-forming microphones and wind reduction.

Four sizes of silicone tips are included for a stable, comfortable seal. Six hours of playback per charge extends to 30 hours with the USB-C case, and ten minutes of charging adds two hours of listening.

**In the box:** earbuds, charging case, USB-C cable, four ear tip sizes.`,
    price: etb(4990),
    compareAtPrice: etb(5990),
    cost: etb(3680),
    featured: true,
    specs: [
      { label: 'Drivers', value: '11mm dynamic' },
      { label: 'Noise cancellation', value: 'Adaptive ANC, transparency mode' },
      { label: 'Battery', value: '6h earbuds, 30h with case' },
      { label: 'Charging', value: 'USB-C, wireless charging case' },
      { label: 'Water resistance', value: 'IPX5' },
      { label: 'Bluetooth', value: '5.3, multipoint' },
      { label: 'Microphones', value: '3 per earbud' },
    ],
    warranty: '12-month AirTone warranty.',
    returnInfo: 'For hygiene reasons, opened earbuds can only be returned if faulty.',
    images: ['earbuds-air'],
    options: [{ name: 'Colour', values: ['Graphite', 'Ivory'] }],
    variants: [
      { suffix: 'GRA', options: { Colour: 'Graphite' }, stock: 38, cost: etb(3680) },
      { suffix: 'IVO', options: { Colour: 'Ivory' }, stock: 31, cost: etb(3680) },
    ],
    soldCount: 316,
    viewCount: 6380,
    supplier: 'Abay Electronics Distribution',
  },
  {
    slug: 'voltedge-65w-gan-charger',
    name: 'VoltEdge 65W GaN Charger',
    sku: 'VE-G65',
    category: 'chargers-power',
    brand: 'voltedge',
    shortDescription: 'One palm-sized charger for a laptop, phone and earbuds at the same time.',
    description: `Gallium nitride internals let the VoltEdge 65W deliver laptop-class power from a plug that fits in a jacket pocket. Two USB-C ports and one USB-A port share 65W intelligently, so a 14-inch laptop and a phone can charge together without slowing to a crawl.

Foldable pins, over-temperature protection and a 1.5m braided USB-C cable are included.`,
    price: etb(2490),
    cost: etb(1720),
    specs: [
      { label: 'Total output', value: '65W' },
      { label: 'Ports', value: '2 × USB-C, 1 × USB-A' },
      { label: 'Protocols', value: 'USB PD 3.0, PPS, QC 4+' },
      { label: 'Dimensions', value: '62 × 38 × 32mm' },
      { label: 'Included', value: '1.5m USB-C to USB-C cable' },
    ],
    warranty: '18-month VoltEdge warranty.',
    returnInfo: 'Returns accepted within 7 days in original packaging.',
    images: ['charger-gan'],
    variants: [{ suffix: 'STD', options: {}, stock: 64, cost: etb(1720) }],
    soldCount: 402,
    viewCount: 5210,
    supplier: 'Abay Electronics Distribution',
  },
  {
    slug: 'nile-tab-11',
    name: 'Nile Tab 11',
    sku: 'LM-NT11',
    category: 'tablets',
    brand: 'lumen',
    shortDescription: 'An 11-inch 2K tablet for study, streaming and lighter work.',
    description: `The Nile Tab 11 balances a crisp 2K display with a thin aluminium body that slips easily into a tote. The optional keyboard folio and pressure-sensitive stylus make it a practical study companion.

An 8,000mAh battery covers a full day of lectures or flights, and four speakers keep films immersive. Parenting controls and a dedicated kids space are built in.`,
    price: etb(27990),
    compareAtPrice: etb(31990),
    cost: etb(22400),
    specs: [
      { label: 'Display', value: '11" 2K IPS, 90Hz' },
      { label: 'Memory', value: '8GB RAM' },
      { label: 'Storage', value: '128GB or 256GB, microSD expandable' },
      { label: 'Battery', value: '8,000mAh, 33W charging' },
      { label: 'Speakers', value: 'Quad stereo' },
      { label: 'Stylus', value: 'Supported, sold separately' },
    ],
    warranty: '24-month Lumen warranty.',
    returnInfo: 'Unopened returns within 7 days; faulty units covered by warranty.',
    images: ['tablet-nile'],
    options: [
      { name: 'Storage', values: ['128GB', '256GB'] },
      { name: 'Colour', values: ['Graphite', 'Silver'] },
    ],
    variants: [
      { suffix: '128-GRA', options: { Storage: '128GB', Colour: 'Graphite' }, stock: 17, cost: etb(22400) },
      { suffix: '128-SIL', options: { Storage: '128GB', Colour: 'Silver' }, stock: 12, cost: etb(22400) },
      { suffix: '256-GRA', options: { Storage: '256GB', Colour: 'Graphite' }, price: etb(32990), stock: 7, cost: etb(26400) },
      { suffix: '256-SIL', options: { Storage: '256GB', Colour: 'Silver' }, price: etb(32990), stock: 5, cost: etb(26400) },
    ],
    soldCount: 97,
    viewCount: 2440,
    supplier: 'Abay Electronics Distribution',
  },
  {
    slug: 'vertex-ultrabook-14',
    name: 'Vertex UltraBook 14',
    sku: 'VX-UB14',
    category: 'laptops',
    brand: 'vertex',
    shortDescription: 'A 1.19kg magnesium ultrabook with a 2.8K OLED screen and 18-hour battery.',
    description: `Built for long days of writing, coding and calls, the UltraBook 14 pairs an efficient 12-core processor with a 2.8K OLED panel that covers 100% of the DCI-P3 gamut.

The backlit keyboard has 1.5mm of travel and the glass trackpad is generous. A 1080p webcam with a privacy shutter, Wi-Fi 6E and two Thunderbolt 4 ports cover the essentials. It charges over USB-C, so the same brick can top up your phone.

**In the box:** laptop, 65W USB-C charger, USB-C cable, sleeve.`,
    price: etb(89990),
    compareAtPrice: etb(96990),
    cost: etb(77200),
    featured: true,
    specs: [
      { label: 'Processor', value: 'Vertex V12, 12 cores' },
      { label: 'Display', value: '14" 2.8K OLED, 90Hz' },
      { label: 'Memory', value: '16GB or 32GB LPDDR5' },
      { label: 'Storage', value: '512GB / 1TB NVMe SSD' },
      { label: 'Battery', value: '70Wh, up to 18 hours' },
      { label: 'Weight', value: '1.19kg' },
      { label: 'Ports', value: '2 × Thunderbolt 4, USB-A, HDMI 2.1, 3.5mm' },
      { label: 'Keyboard', value: 'Backlit, 1.5mm travel' },
      { label: 'Webcam', value: '1080p with privacy shutter' },
    ],
    warranty: '24-month Vertex warranty with onsite support in Addis Ababa.',
    returnInfo: 'Returns accepted within 7 days in unopened packaging.',
    images: ['laptop-ultrabook'],
    options: [{ name: 'Memory', values: ['16GB', '32GB'] }],
    variants: [
      { suffix: '16', options: { Memory: '16GB' }, stock: 8, cost: etb(77200) },
      { suffix: '32', options: { Memory: '32GB' }, price: etb(109990), compareAtPrice: etb(116990), stock: 4, cost: etb(94800) },
    ],
    soldCount: 41,
    viewCount: 1980,
    supplier: 'Abay Electronics Distribution',
  },
  {
    slug: 'vertex-view-27-qhd',
    name: 'Vertex View 27 QHD Monitor',
    sku: 'VX-V27',
    category: 'monitors',
    brand: 'vertex',
    shortDescription: 'A colour-accurate 27-inch QHD display with USB-C power delivery.',
    description: `The View 27 covers 98% DCI-P3 and is factory calibrated to Delta E under 2, so edits look the same on screen as they do in print. A single USB-C cable carries video, data and 65W of power to a laptop.

The stand adjusts for height, tilt and pivot, and a built-in KVM switch lets you share a keyboard and mouse between two computers.`,
    price: etb(32990),
    cost: etb(27600),
    specs: [
      { label: 'Panel', value: '27" IPS QHD 2560 × 1440' },
      { label: 'Refresh rate', value: '75Hz' },
      { label: 'Colour', value: '98% DCI-P3, Delta E < 2' },
      { label: 'Ports', value: 'USB-C 65W, 2 × HDMI, DisplayPort, 4 × USB-A' },
      { label: 'Ergonomics', value: 'Height, tilt, swivel, pivot' },
      { label: 'VESA', value: '100 × 100mm' },
    ],
    warranty: '36-month Vertex warranty including panel coverage.',
    returnInfo: 'Returns accepted within 7 days; dead-pixel policy applies.',
    images: ['monitor-qhd'],
    variants: [{ suffix: 'STD', options: {}, stock: 12, cost: etb(27600) }],
    soldCount: 58,
    viewCount: 1510,
    supplier: 'Abay Electronics Distribution',
  },
  {
    slug: 'keystroke-k87-keyboard',
    name: 'Keystroke K87 Mechanical Keyboard',
    sku: 'KS-K87',
    category: 'keyboards-mice',
    brand: 'keystroke',
    shortDescription: 'A compact 87-key board with hot-swappable switches and dual-mode wireless.',
    description: `The K87 keeps the arrow keys and function row while trimming the numpad for more desk space. Gasket mounting and two layers of foam give a soft, muted typing feel.

Hot-swap sockets accept most 3- and 5-pin switches, so you can change the feel without soldering. Connect over 2.4GHz, Bluetooth to three devices, or USB-C.`,
    price: etb(4290),
    cost: etb(3180),
    specs: [
      { label: 'Layout', value: '87 keys, ANSI' },
      { label: 'Switches', value: 'Tactile or linear, hot-swappable' },
      { label: 'Keycaps', value: 'Double-shot PBT' },
      { label: 'Connection', value: '2.4GHz, Bluetooth 5.1, USB-C' },
      { label: 'Battery', value: '4,000mAh' },
      { label: 'Compatibility', value: 'Windows, macOS, Linux' },
    ],
    warranty: '12-month Keystroke warranty.',
    returnInfo: 'Returns accepted within 7 days if unused.',
    images: ['keyboard-mech'],
    options: [{ name: 'Switch', values: ['Tactile', 'Linear'] }],
    variants: [
      { suffix: 'TAC', options: { Switch: 'Tactile' }, stock: 23, cost: etb(3180) },
      { suffix: 'LIN', options: { Switch: 'Linear' }, stock: 18, cost: etb(3180) },
    ],
    soldCount: 132,
    viewCount: 2740,
    supplier: 'Abay Electronics Distribution',
  },
  {
    slug: 'airtone-max-headphones',
    name: 'AirTone Max Noise-Cancelling Headphones',
    sku: 'AT-AMAX',
    category: 'audio',
    brand: 'airtone',
    shortDescription: 'Over-ear comfort, best-in-class noise cancelling and 40 hours of listening.',
    description: `AirTone Max uses eight microphones and a dedicated noise processor to quiet busy offices, buses and flights. The 40mm drivers are tuned for a warm midrange and controlled bass that stays detailed at low volumes.

Memory-foam ear cushions and a 260g frame make long sessions comfortable. Multipoint Bluetooth keeps your laptop and phone connected at once, and a 3.5mm cable is included for in-flight entertainment.`,
    price: etb(9990),
    compareAtPrice: etb(11990),
    cost: etb(7350),
    featured: true,
    specs: [
      { label: 'Type', value: 'Over-ear, closed back' },
      { label: 'Drivers', value: '40mm dynamic' },
      { label: 'Noise cancellation', value: 'Adaptive ANC with transparency' },
      { label: 'Battery', value: '40h ANC off, 30h ANC on' },
      { label: 'Charging', value: 'USB-C, 5 min = 4 hours' },
      { label: 'Bluetooth', value: '5.3, multipoint, LDAC' },
      { label: 'Weight', value: '260g' },
    ],
    warranty: '24-month AirTone warranty.',
    returnInfo: 'Returns accepted within 7 days in original packaging.',
    images: ['headphones-max'],
    options: [{ name: 'Colour', values: ['Black', 'Sand'] }],
    variants: [
      { suffix: 'BLK', options: { Colour: 'Black' }, stock: 17, cost: etb(7350) },
      { suffix: 'SND', options: { Colour: 'Sand' }, stock: 11, cost: etb(7350) },
    ],
    soldCount: 221,
    viewCount: 5830,
    supplier: 'Abay Electronics Distribution',
  },
  {
    slug: 'lumen-fit-s2',
    name: 'Lumen Fit S2 Smartwatch',
    sku: 'LM-FS2',
    category: 'wearables',
    brand: 'lumen',
    shortDescription: 'A slim AMOLED smartwatch with GPS, sleep insights and a 10-day battery.',
    description: `The Fit S2 tracks heart rate, blood oxygen, sleep stages and more than 100 workouts. Built-in GPS means you can leave your phone at home on a run around the Entoto trails.

The 1.4-inch AMOLED display stays readable in direct sun, and the aluminium case is water resistant to 5ATM. A full charge lasts up to ten days, or five with always-on display enabled.`,
    price: etb(8490),
    cost: etb(6480),
    specs: [
      { label: 'Display', value: '1.4" AMOLED, always-on' },
      { label: 'Battery', value: 'Up to 10 days' },
      { label: 'Sensors', value: 'Heart rate, SpO2, GPS, accelerometer' },
      { label: 'Water resistance', value: '5ATM' },
      { label: 'Compatibility', value: 'iOS 14+, Android 9+' },
      { label: 'Strap', value: '22mm quick release, silicone' },
    ],
    warranty: '12-month Lumen warranty.',
    returnInfo: 'For hygiene reasons, worn watches can only be returned if faulty.',
    images: ['smartwatch-fit'],
    options: [{ name: 'Case', values: ['40mm', '44mm'] }],
    variants: [
      { suffix: '40', options: { Case: '40mm' }, stock: 26, cost: etb(6480) },
      { suffix: '44', options: { Case: '44mm' }, price: etb(8990), stock: 19, cost: etb(6900) },
    ],
    soldCount: 268,
    viewCount: 4310,
    supplier: 'Abay Electronics Distribution',
  },
  {
    slug: 'sahara-weekender-bag',
    name: 'Sahara Leather Weekender',
    sku: 'SH-WKND',
    category: 'bags',
    brand: 'sahara',
    shortDescription: 'A full-grain leather holdall sized for two nights away.',
    description: `Cut from vegetable-tanned full-grain leather, the Weekender develops a rich patina with use. The 42-litre interior fits two or three days of clothing, a laptop and a pair of shoes.

A wide canvas-lined opening makes packing easy, and solid brass hardware is built to be repaired rather than replaced. Each bag is finished by hand in Addis Ababa.`,
    price: etb(12900),
    compareAtPrice: etb(14900),
    cost: etb(8900),
    specs: [
      { label: 'Material', value: 'Vegetable-tanned full-grain leather' },
      { label: 'Lining', value: 'Cotton canvas' },
      { label: 'Capacity', value: '42 litres' },
      { label: 'Dimensions', value: '52 × 28 × 30cm' },
      { label: 'Hardware', value: 'Solid brass' },
      { label: 'Strap', value: 'Detachable padded shoulder strap' },
    ],
    warranty: '2-year craftsmanship warranty; free repairs on hardware.',
    returnInfo: 'Returns accepted within 7 days if unused with tags attached.',
    images: ['bag-weekender'],
    options: [{ name: 'Colour', values: ['Cognac', 'Black'] }],
    variants: [
      { suffix: 'COG', options: { Colour: 'Cognac' }, stock: 9, cost: etb(8900) },
      { suffix: 'BLK', options: { Colour: 'Black' }, stock: 6, cost: etb(8900) },
    ],
    soldCount: 64,
    viewCount: 2180,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'addis-cotton-oxford-shirt',
    name: 'Addis Cotton Oxford Shirt',
    sku: 'MT-OXFD',
    category: 'men',
    brand: 'merkato-threads',
    shortDescription: 'Breathable long-staple cotton with a soft collar that works with or without a tie.',
    description: `Woven from long-staple Ethiopian cotton, this Oxford shirt is brushed for softness but still holds a clean line. The button-down collar sits neatly under a jacket and looks relaxed on its own.

A slightly longer tail keeps it tucked in, while reinforced side seams and mother-of-pearl buttons make it a shirt you keep for years. Machine wash cold, hang dry.`,
    price: etb(2190),
    compareAtPrice: etb(2590),
    cost: etb(1420),
    specs: [
      { label: 'Fabric', value: '100% long-staple cotton Oxford' },
      { label: 'Fit', value: 'Regular fit' },
      { label: 'Collar', value: 'Button-down' },
      { label: 'Buttons', value: 'Mother-of-pearl' },
      { label: 'Care', value: 'Machine wash cold, hang dry' },
      { label: 'Made in', value: 'Ethiopia' },
    ],
    warranty: '6-month manufacturing warranty.',
    returnInfo: 'Free size exchange within 14 days if unworn with tags.',
    images: ['shirt-cotton'],
    options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
    variants: [
      { suffix: 'S', options: { Size: 'S' }, stock: 12, cost: etb(1420) },
      { suffix: 'M', options: { Size: 'M' }, stock: 18, cost: etb(1420) },
      { suffix: 'L', options: { Size: 'L' }, stock: 16, cost: etb(1420) },
      { suffix: 'XL', options: { Size: 'XL' }, stock: 8, cost: etb(1420) },
    ],
    soldCount: 189,
    viewCount: 3020,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'rift-runner-sneakers',
    name: 'Rift Runner Sneakers',
    sku: 'RF-RUN',
    category: 'shoes',
    brand: 'rift',
    shortDescription: 'Light daily trainers with a responsive foam midsole for road and treadmill.',
    description: `The Runner is built for everyday kilometres. A nitrogen-infused foam midsole returns energy without feeling unstable, and the engineered mesh upper breathes through Addis afternoons.

A wide toe box gives room for long runs, while the rubber outsole uses a tread pattern that grips wet asphalt. True to size for most runners; go half a size up for wide feet.`,
    price: etb(3990),
    compareAtPrice: etb(4590),
    cost: etb(2780),
    specs: [
      { label: 'Upper', value: 'Engineered mesh' },
      { label: 'Midsole', value: 'Nitrogen-infused EVA foam' },
      { label: 'Outsole', value: 'Abrasion-resistant rubber' },
      { label: 'Weight', value: '248g (EU 42)' },
      { label: 'Drop', value: '8mm' },
      { label: 'Use', value: 'Road, treadmill, daily training' },
    ],
    warranty: '6-month manufacturing warranty.',
    returnInfo: 'Unworn returns within 14 days; free exchanges for sizing.',
    images: ['sneakers-runner'],
    options: [{ name: 'Size', values: ['40', '41', '42', '43', '44'] }],
    variants: [
      { suffix: '40', options: { Size: '40' }, stock: 7, cost: etb(2780) },
      { suffix: '41', options: { Size: '41' }, stock: 11, cost: etb(2780) },
      { suffix: '42', options: { Size: '42' }, stock: 13, cost: etb(2780) },
      { suffix: '43', options: { Size: '43' }, stock: 9, cost: etb(2780) },
      { suffix: '44', options: { Size: '44' }, stock: 4, cost: etb(2780) },
    ],
    soldCount: 246,
    viewCount: 3760,
    supplier: 'Rift Supply Co.',
  },
  {
    slug: 'bunna-pour-over-set',
    name: 'Bunna Pour-Over Coffee Set',
    sku: 'BN-POUR',
    category: 'kitchen-dining',
    brand: 'bunna',
    shortDescription: 'Hand-thrown ceramic dripper, carafe and two cups for a slower morning.',
    description: `A complete pour-over ritual in stoneware: a V-shaped dripper, a 600ml carafe and two 180ml cups, glazed in warm sand and deep indigo. Each piece is thrown by a small ceramic studio in Addis Ababa, so slight variations are part of the character.

The set includes a stainless steel filter and a scoop calibrated to 15g of coffee. Dishwasher safe, though hand washing keeps the glaze lustrous.`,
    price: etb(2890),
    cost: etb(1980),
    featured: true,
    specs: [
      { label: 'Material', value: 'Glazed stoneware' },
      { label: 'Includes', value: 'Dripper, 600ml carafe, 2 cups, steel filter, scoop' },
      { label: 'Capacity', value: '2 cups per brew' },
      { label: 'Care', value: 'Dishwasher safe' },
      { label: 'Made in', value: 'Addis Ababa, Ethiopia' },
    ],
    warranty: 'Breakage on arrival replaced within 7 days.',
    returnInfo: 'Returns accepted within 7 days if unused and complete.',
    images: ['coffee-pourover'],
    variants: [{ suffix: 'STD', options: {}, stock: 21, cost: etb(1980) }],
    soldCount: 154,
    viewCount: 2960,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'kokeb-ceramic-table-lamp',
    name: 'Kokeb Ceramic Table Lamp',
    sku: 'KH-LAMP',
    category: 'lighting',
    brand: 'kokeb-home',
    shortDescription: 'A softly glazed ceramic base with a linen shade for warm evening light.',
    description: `The Kokeb lamp has a hand-glazed ceramic base in a matte oatmeal finish and a natural linen shade that diffuses light evenly. At 48cm tall it suits a bedside table or the corner of a reading chair.

A fabric-covered cord and inline switch keep the look considered. Takes one E27 bulb up to 40W (LED recommended, not included).`,
    price: etb(3490),
    cost: etb(2410),
    specs: [
      { label: 'Height', value: '48cm' },
      { label: 'Base', value: 'Hand-glazed ceramic' },
      { label: 'Shade', value: 'Natural linen' },
      { label: 'Bulb', value: 'E27, max 40W (not included)' },
      { label: 'Cord', value: '1.8m fabric-covered, inline switch' },
    ],
    warranty: '12-month electrical warranty.',
    returnInfo: 'Returns accepted within 7 days if unused and in original packaging.',
    images: ['lamp-ceramic'],
    variants: [{ suffix: 'STD', options: {}, stock: 15, cost: etb(2410) }],
    soldCount: 73,
    viewCount: 1740,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'kokeb-kilim-throw',
    name: 'Kokeb Handwoven Kilim Throw',
    sku: 'KH-KILM',
    category: 'textiles',
    brand: 'kokeb-home',
    shortDescription: 'A handwoven cotton throw with a quiet geometric pattern and soft fringed ends.',
    description: `Woven on traditional looms, this throw adds texture and warmth without visual noise. The cotton is pre-washed for softness and the palette stays grounded in sand, clay and indigo.

Use it over a sofa arm, at the end of a bed or as a picnic blanket. Each throw takes a weaver around two days to complete.`,
    price: etb(2690),
    compareAtPrice: etb(3190),
    cost: etb(1760),
    specs: [
      { label: 'Material', value: '100% cotton' },
      { label: 'Size', value: '130 × 180cm or 160 × 220cm' },
      { label: 'Weight', value: '900g (130 × 180cm)' },
      { label: 'Care', value: 'Machine wash cold, gentle cycle' },
      { label: 'Origin', value: 'Handwoven in Ethiopia' },
    ],
    warranty: '6-month weaving warranty.',
    returnInfo: 'Returns accepted within 7 days if unused.',
    images: ['throw-kilim'],
    options: [{ name: 'Size', values: ['130 × 180cm', '160 × 220cm'] }],
    variants: [
      { suffix: '130', options: { Size: '130 × 180cm' }, stock: 13, cost: etb(1760) },
      { suffix: '160', options: { Size: '160 × 220cm' }, price: etb(3290), stock: 8, cost: etb(2140) },
    ],
    soldCount: 112,
    viewCount: 2280,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'glow-lab-vitamin-c-serum',
    name: 'Glow Lab Vitamin C Serum',
    sku: 'GL-VITC',
    category: 'skincare',
    brand: 'glow-lab',
    shortDescription: 'A stable 15% vitamin C serum with ferulic acid for brighter, even-toned skin.',
    description: `Glow Lab pairs 15% ethylated ascorbic acid with ferulic acid and vitamin E to brighten dullness and soften the look of dark spots. The lightweight, fragrance-free formula absorbs quickly and layers well under sunscreen.

Use three or four drops in the morning on clean skin, followed by moisturiser and SPF. The amber glass bottle protects the formula from light. Suitable for most skin types; patch test first.`,
    price: etb(1590),
    compareAtPrice: etb(1890),
    cost: etb(940),
    specs: [
      { label: 'Key actives', value: '15% vitamin C, ferulic acid, vitamin E' },
      { label: 'Volume', value: '30ml' },
      { label: 'Skin type', value: 'All, including sensitive' },
      { label: 'Fragrance', value: 'Fragrance-free' },
      { label: 'Use', value: 'Morning, before moisturiser and SPF' },
    ],
    warranty: 'Sealed products replaced if damaged on arrival.',
    returnInfo: 'For hygiene reasons, opened skincare cannot be returned unless faulty.',
    images: ['serum-vitc'],
    variants: [{ suffix: '30', options: {}, stock: 46, cost: etb(940) }],
    soldCount: 388,
    viewCount: 6610,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'sente-oud-addis',
    name: 'Sente Oud Addis Eau de Parfum',
    sku: 'SN-OUD',
    category: 'fragrance',
    brand: 'sente',
    shortDescription: 'Smoky oud, bergamot and Ethiopian rose for evenings that linger.',
    description: `Sente's signature scent opens with bergamot and pink pepper before settling into a heart of Ethiopian rose and smoky oud. Vetiver and amber hold the base close to the skin for hours.

Blended in small batches with a 20% concentration, Oud Addis is designed for evening wear but wears beautifully in cooler weather. The bottle is refillable.`,
    price: etb(5890),
    cost: etb(3900),
    featured: true,
    specs: [
      { label: 'Concentration', value: 'Eau de parfum, 20%' },
      { label: 'Top notes', value: 'Bergamot, pink pepper' },
      { label: 'Heart notes', value: 'Ethiopian rose, oud' },
      { label: 'Base notes', value: 'Vetiver, amber, cedar' },
      { label: 'Sizes', value: '50ml, 100ml' },
      { label: 'Bottle', value: 'Refillable glass' },
    ],
    warranty: 'Sealed products replaced if damaged on arrival.',
    returnInfo: 'For hygiene reasons, opened fragrance cannot be returned unless faulty.',
    images: ['perfume-oud'],
    options: [{ name: 'Size', values: ['50ml', '100ml'] }],
    variants: [
      { suffix: '50', options: { Size: '50ml' }, stock: 16, cost: etb(3900) },
      { suffix: '100', options: { Size: '100ml' }, price: etb(8490), stock: 9, cost: etb(5600) },
    ],
    soldCount: 96,
    viewCount: 3120,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'glow-lab-argan-hair-oil',
    name: 'Glow Lab Argan Repair Hair Oil',
    sku: 'GL-ARGAN',
    category: 'haircare',
    brand: 'glow-lab',
    shortDescription: 'A light finishing oil with cold-pressed argan and baobab for shine without weight.',
    description: `Two or three drops of this cold-pressed blend smooth frizz and add shine to dry or colour-treated hair. Argan and baobab oils absorb quickly, while a touch of vitamin E protects against environmental stress.

Use on damp hair before styling or on dry ends as a finishing touch. Silicone-free and safe for relaxed and natural hair.`,
    price: etb(890),
    cost: etb(520),
    specs: [
      { label: 'Key oils', value: 'Cold-pressed argan, baobab' },
      { label: 'Volume', value: '50ml' },
      { label: 'Hair type', value: 'All, especially dry or coloured' },
      { label: 'Free from', value: 'Silicones, mineral oil, parabens' },
      { label: 'Use', value: '2-3 drops on damp or dry hair' },
    ],
    warranty: 'Sealed products replaced if damaged on arrival.',
    returnInfo: 'For hygiene reasons, opened haircare cannot be returned unless faulty.',
    images: ['hairoil-argan'],
    variants: [{ suffix: '50', options: {}, stock: 52, cost: etb(520) }],
    soldCount: 344,
    viewCount: 4820,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'rift-flow-yoga-mat',
    name: 'Rift Flow Yoga Mat',
    sku: 'RF-YMAT',
    category: 'fitness',
    brand: 'rift',
    shortDescription: 'A grippy 5mm natural rubber mat with alignment lines and a carry strap.',
    description: `The Flow mat uses natural tree rubber with a moisture-wicking top layer that keeps hands steady through hot sessions. At 5mm it cushions knees and wrists without sacrificing balance.

Subtle alignment lines help with positioning, and the included cotton strap makes it easy to carry to class. Wipe down after use and air dry fully before rolling.`,
    price: etb(1790),
    cost: etb(1180),
    specs: [
      { label: 'Material', value: 'Natural rubber, polyurethane top' },
      { label: 'Thickness', value: '5mm' },
      { label: 'Size', value: '183 × 68cm' },
      { label: 'Weight', value: '2.4kg' },
      { label: 'Includes', value: 'Cotton carry strap' },
      { label: 'Colours', value: 'Sage, charcoal' },
    ],
    warranty: '12-month manufacturing warranty.',
    returnInfo: 'Returns accepted within 7 days if unused.',
    images: ['yoga-mat'],
    options: [{ name: 'Colour', values: ['Sage', 'Charcoal'] }],
    variants: [
      { suffix: 'SAG', options: { Colour: 'Sage' }, stock: 27, cost: etb(1180) },
      { suffix: 'CHA', options: { Colour: 'Charcoal' }, stock: 23, cost: etb(1180) },
    ],
    soldCount: 176,
    viewCount: 2610,
    supplier: 'Rift Supply Co.',
  },
  {
    slug: 'rift-ironcore-dumbbell-set',
    name: 'Rift IronCore Dumbbell Set',
    sku: 'RF-DB20',
    category: 'fitness',
    brand: 'rift',
    shortDescription: 'Rubber-coated cast iron dumbbells with knurled handles for home training.',
    description: `A pair of rubber-coated cast iron dumbbells that protect floors and keep noise down. The knurled steel handles are comfortable without shredding your palms, and the hex shape stops them rolling between sets.

Available as 2 × 10kg or 2 × 15kg. Sold as a pair.`,
    price: etb(5490),
    cost: etb(4200),
    specs: [
      { label: 'Material', value: 'Cast iron, rubber coated' },
      { label: 'Weights', value: '2 × 10kg or 2 × 15kg' },
      { label: 'Handle', value: 'Knurled steel, 32mm' },
      { label: 'Shape', value: 'Hexagon, anti-roll' },
      { label: 'Sold as', value: 'Pair' },
    ],
    warranty: '24-month structural warranty.',
    returnInfo: 'Returns accepted within 7 days if unused.',
    images: ['dumbbells'],
    options: [{ name: 'Weight', values: ['2 × 10kg', '2 × 15kg'] }],
    variants: [
      { suffix: '10', options: { Weight: '2 × 10kg' }, stock: 9, cost: etb(4200) },
      { suffix: '15', options: { Weight: '2 × 15kg' }, price: etb(7490), stock: 5, cost: etb(5800) },
    ],
    soldCount: 87,
    viewCount: 1890,
    supplier: 'Rift Supply Co.',
  },
  {
    slug: 'rift-trek-35l-backpack',
    name: 'Rift Trek 35L Backpack',
    sku: 'RF-TREK35',
    category: 'outdoor',
    brand: 'rift',
    shortDescription: 'A weatherproof 35-litre daypack with a ventilated back panel and laptop sleeve.',
    description: `The Trek 35L works as a daypack, a carry-on or a weekender. A recycled ripstop shell with a water-resistant coating sheds light rain, and the ventilated back panel keeps you cooler on climbs.

The padded sleeve fits a 16-inch laptop, and daisy chains plus a stretch front pocket carry a jacket or trekking poles. A rain cover is included.`,
    price: etb(3290),
    cost: etb(2380),
    specs: [
      { label: 'Capacity', value: '35 litres' },
      { label: 'Shell', value: 'Recycled ripstop nylon, DWR coated' },
      { label: 'Laptop', value: 'Fits up to 16"' },
      { label: 'Weight', value: '980g' },
      { label: 'Includes', value: 'Rain cover, hip belt' },
      { label: 'Colours', value: 'Olive, black' },
    ],
    warranty: '24-month Rift warranty.',
    returnInfo: 'Returns accepted within 7 days if unused with tags.',
    images: ['backpack-35l'],
    options: [{ name: 'Colour', values: ['Olive', 'Black'] }],
    variants: [
      { suffix: 'OLV', options: { Colour: 'Olive' }, stock: 18, cost: etb(2380) },
      { suffix: 'BLK', options: { Colour: 'Black' }, stock: 15, cost: etb(2380) },
    ],
    soldCount: 137,
    viewCount: 2560,
    supplier: 'Rift Supply Co.',
  },
  {
    slug: 'quill-notebook-set',
    name: 'Quill Notebook Set of 3',
    sku: 'QL-NB3',
    category: 'stationery',
    brand: 'quill',
    shortDescription: 'Three lay-flat notebooks with 100gsm paper and dotted, ruled and plain pages.',
    description: `A tidy set of three A5 notebooks for planning, notes and sketches. The 100gsm paper handles fountain pens without bleed, and each book lies flat thanks to a stitched spine.

One dotted, one ruled and one plain, each with 96 pages, an index page and a ribbon marker. Covers are made from recycled board.`,
    price: etb(690),
    cost: etb(380),
    specs: [
      { label: 'Format', value: 'A5, 148 × 210mm' },
      { label: 'Pages', value: '96 per notebook' },
      { label: 'Paper', value: '100gsm, fountain-pen friendly' },
      { label: 'Ruling', value: 'Dotted, ruled, plain' },
      { label: 'Binding', value: 'Stitched, lay-flat' },
      { label: 'Cover', value: 'Recycled board' },
    ],
    warranty: 'Replaced if damaged on arrival.',
    returnInfo: 'Returns accepted within 7 days if unused.',
    images: ['notebooks-set'],
    variants: [{ suffix: 'SET3', options: {}, stock: 68, cost: etb(380) }],
    soldCount: 294,
    viewCount: 3420,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'kokeb-ergo-office-chair',
    name: 'Kokeb Ergo Comfort Office Chair',
    sku: 'KH-ERGO',
    category: 'office-furniture',
    brand: 'kokeb-home',
    shortDescription: 'A mesh-back task chair with adjustable lumbar support and a quiet tilt mechanism.',
    description: `Built for long working days, the Ergo has a breathable mesh back with adjustable lumbar support and a seat that slides to fit your leg length. Armrests move in three directions so your shoulders can relax.

The synchro-tilt mechanism reclines smoothly and locks in four positions. A class-4 gas lift and nylon base support up to 120kg. Assembly takes about 20 minutes with the included tools.`,
    price: etb(14900),
    compareAtPrice: etb(16900),
    cost: etb(10500),
    specs: [
      { label: 'Back', value: 'Breathable mesh with adjustable lumbar support' },
      { label: 'Seat', value: 'High-density foam, sliding depth' },
      { label: 'Armrests', value: '3D adjustable' },
      { label: 'Mechanism', value: 'Synchro-tilt, 4-position lock' },
      { label: 'Weight capacity', value: '120kg' },
      { label: 'Warranty', value: '5 years on mechanism, 2 years on fabric' },
    ],
    warranty: '5-year mechanism warranty, 2-year fabric warranty.',
    returnInfo: 'Returns accepted within 7 days if unassembled; assembly service available.',
    images: ['office-chair'],
    options: [{ name: 'Colour', values: ['Graphite', 'Sand'] }],
    variants: [
      { suffix: 'GRA', options: { Colour: 'Graphite' }, stock: 8, cost: etb(10500) },
      { suffix: 'SND', options: { Colour: 'Sand' }, stock: 5, cost: etb(10500) },
    ],
    soldCount: 52,
    viewCount: 1460,
    supplier: 'Sheba Lifestyle Trading',
  },
  {
    slug: 'quill-executive-pen-set',
    name: 'Quill Executive Pen Set',
    sku: 'QL-PEN2',
    category: 'stationery',
    brand: 'quill',
    shortDescription: 'A ballpoint and rollerball pair in brushed aluminium with a magnetic stand.',
    description: `A matched pair for signing, sketching and daily notes. The brushed aluminium barrels have a satisfying weight, and the magnetic stand keeps them upright on a desk.

The rollerball uses standard international refills, and the ballpoint takes a common Parker-style refill, so replacements are easy to find. Presented in a recycled gift box.`,
    price: etb(1190),
    cost: etb(710),
    specs: [
      { label: 'Includes', value: 'Ballpoint, rollerball, magnetic stand' },
      { label: 'Body', value: 'Brushed aluminium' },
      { label: 'Refills', value: 'Standard international / Parker-style' },
      { label: 'Presentation', value: 'Recycled gift box' },
    ],
    warranty: 'Replaced if damaged on arrival.',
    returnInfo: 'Returns accepted within 7 days if unused.',
    images: ['pen-set'],
    variants: [{ suffix: 'SET2', options: {}, stock: 42, cost: etb(710) }],
    soldCount: 163,
    viewCount: 1980,
    supplier: 'Sheba Lifestyle Trading',
  },
];

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const staff: SeedStaff[] = [
  { email: 'admin@nilemart.et', name: 'Meron Haile', phone: '+251 911 100 001', role: 'super_admin' },
  { email: 'manager@nilemart.et', name: 'Samuel Getachew', phone: '+251 911 100 002', role: 'store_manager' },
  { email: 'inventory@nilemart.et', name: 'Lidya Assefa', phone: '+251 911 100 003', role: 'inventory_manager' },
  { email: 'fulfillment@nilemart.et', name: 'Bruk Tesfaye', phone: '+251 911 100 004', role: 'fulfillment' },
  { email: 'finance@nilemart.et', name: 'Eden Woldemariam', phone: '+251 911 100 005', role: 'finance' },
  { email: 'support@nilemart.et', name: 'Nahom Kebede', phone: '+251 911 100 006', role: 'support' },
];

export const customers: SeedCustomer[] = [
  {
    email: 'customer@nilemart.et',
    name: 'Hana Tesfaye',
    phone: '+251 911 234 567',
    city: 'Addis Ababa',
    region: 'Bole',
    line1: 'House 214, Cameroon Street',
    marketingOptIn: true,
  },
  {
    email: 'dawit@example.com',
    name: 'Dawit Bekele',
    phone: '+251 912 345 678',
    city: 'Addis Ababa',
    region: 'Kirkos',
    line1: 'Apartment 5B, Wollo Sefer',
  },
  {
    email: 'selam@example.com',
    name: 'Selam Girma',
    phone: '+251 913 456 789',
    city: 'Adama',
    region: 'Oromia',
    line1: 'Villa 12, Franco Area',
  },
  {
    email: 'yonas@example.com',
    name: 'Yonas Alemu',
    phone: '+251 914 567 890',
    city: 'Addis Ababa',
    region: 'Yeka',
    line1: 'House 78, Megenagna',
  },
  {
    email: 'ruth@example.com',
    name: 'Ruth Mekonnen',
    phone: '+251 915 678 901',
    city: 'Bahir Dar',
    region: 'Amhara',
    line1: 'Kebele 14, Blue Nile Street',
  },
  {
    email: 'abel@example.com',
    name: 'Abel Tadesse',
    phone: '+251 916 789 012',
    city: 'Hawassa',
    region: 'Sidama',
    line1: 'House 33, Lake Road',
  },
];

export const demoCustomerPassword = 'Customer#2026';

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export const reviews: SeedReview[] = [
  {
    product: 'lumen-pulse-x6-pro',
    customer: 'customer@nilemart.et',
    rating: 5,
    title: 'Flagship feel without the flagship price',
    body: 'The screen is genuinely excellent outdoors and the battery gets me through a full day of calls and photos. Delivery to Bole took two days and the box was sealed.',
    daysAgo: 12,
    verified: true,
  },
  {
    product: 'lumen-pulse-x6-pro',
    customer: 'dawit@example.com',
    rating: 4,
    title: 'Great camera, slightly slippery',
    body: 'Low-light photos are much better than my old phone. The glass back picks up fingerprints, so I use the included case. Charging is very fast.',
    daysAgo: 26,
    verified: true,
  },
  {
    product: 'lumen-pulse-x6-pro',
    customer: 'selam@example.com',
    rating: 5,
    title: 'Worth the upgrade',
    body: 'Switched from a three-year-old phone and the difference is huge. The 120Hz screen makes everything feel smooth and the fingerprint reader is reliable.',
    daysAgo: 41,
    verified: true,
  },
  {
    product: 'airtone-pro-earbuds',
    customer: 'yonas@example.com',
    rating: 5,
    title: 'Noise cancelling that actually works',
    body: 'I use these on the light rail every morning and the rumble almost disappears. Call quality is clear on the other end too.',
    daysAgo: 9,
    verified: true,
  },
  {
    product: 'airtone-pro-earbuds',
    customer: 'ruth@example.com',
    rating: 4,
    title: 'Comfortable for long calls',
    body: 'The small tips fit me well and I can wear them for two-hour meetings without discomfort. The case is a little chunky in a jeans pocket.',
    daysAgo: 33,
    verified: true,
  },
  {
    product: 'airtone-pro-earbuds',
    customer: 'abel@example.com',
    rating: 5,
    title: 'Excellent value',
    body: 'Sound is warm and detailed, and pairing with my laptop and phone at the same time is genuinely useful. Arrived in Hawassa in three days.',
    daysAgo: 52,
  },
  {
    product: 'vertex-ultrabook-14',
    customer: 'dawit@example.com',
    rating: 5,
    title: 'Perfect for a developer on the move',
    body: 'The keyboard is a pleasure to type on and the OLED screen makes long reading sessions easy on the eyes. Battery easily lasts a workday.',
    daysAgo: 18,
    verified: true,
  },
  {
    product: 'vertex-ultrabook-14',
    customer: 'customer@nilemart.et',
    rating: 4,
    title: 'Light and fast, fan can get loud',
    body: 'Compiles my projects quickly and the screen is beautiful. Under sustained load the fan becomes audible, though it never throttles badly.',
    daysAgo: 47,
    verified: true,
  },
  {
    product: 'airtone-max-headphones',
    customer: 'selam@example.com',
    rating: 5,
    title: 'My favourite purchase this year',
    body: 'The noise cancelling is superb on flights and the earcups do not get hot. Battery life is exactly as promised.',
    daysAgo: 7,
    verified: true,
  },
  {
    product: 'airtone-max-headphones',
    customer: 'yonas@example.com',
    rating: 5,
    title: 'Superb detail at low volume',
    body: 'I listen to a lot of jazz and these keep the bass controlled while vocals stay forward. The case is sturdy and the cable is a nice touch.',
    daysAgo: 22,
    verified: true,
  },
  {
    product: 'airtone-max-headphones',
    customer: 'ruth@example.com',
    rating: 4,
    title: 'Very comfortable, bass slightly warm',
    body: 'Wore them for a six-hour bus ride with no fatigue. If you prefer a neutral sound signature, use the EQ in the app.',
    daysAgo: 38,
  },
  {
    product: 'bunna-pour-over-set',
    customer: 'customer@nilemart.et',
    rating: 5,
    title: 'Mornings feel calmer already',
    body: 'The ceramic is beautiful and the carafe pours without dripping. I have been using it every morning with Yirgacheffe beans.',
    daysAgo: 15,
    verified: true,
  },
  {
    product: 'bunna-pour-over-set',
    customer: 'selam@example.com',
    rating: 4,
    title: 'Lovely set, filter takes practice',
    body: 'The cups are the perfect size and the glaze is even nicer in person. My first brews were slow while I learned the grind size.',
    daysAgo: 29,
  },
  {
    product: 'bunna-pour-over-set',
    customer: 'abel@example.com',
    rating: 5,
    title: 'Great gift',
    body: 'Bought this for my sister and she loved it. Packaging was secure and nothing arrived broken, which was my main worry.',
    daysAgo: 56,
  },
  {
    product: 'glow-lab-vitamin-c-serum',
    customer: 'ruth@example.com',
    rating: 5,
    title: 'Visible improvement in three weeks',
    body: 'My dark spots have faded noticeably and the serum layers well under sunscreen without pilling. No irritation on my sensitive skin.',
    daysAgo: 11,
    verified: true,
  },
  {
    product: 'glow-lab-vitamin-c-serum',
    customer: 'customer@nilemart.et',
    rating: 4,
    title: 'Light and effective',
    body: 'Absorbs quickly and has no strong smell. I wish the bottle were slightly larger for the price, but a little goes a long way.',
    daysAgo: 24,
    verified: true,
  },
  {
    product: 'glow-lab-vitamin-c-serum',
    customer: 'selam@example.com',
    rating: 5,
    title: 'Finally a vitamin C that does not sting',
    body: 'I have tried several serums that irritated my skin. This one is gentle and my complexion looks brighter after a month.',
    daysAgo: 43,
  },
  {
    product: 'sente-oud-addis',
    customer: 'yonas@example.com',
    rating: 5,
    title: 'Compliments every time',
    body: 'Warm, smoky and not at all overpowering. Two sprays in the morning still linger in the evening. The refillable bottle is a nice detail.',
    daysAgo: 14,
    verified: true,
  },
  {
    product: 'sente-oud-addis',
    customer: 'ruth@example.com',
    rating: 5,
    title: 'A proper evening scent',
    body: 'The rose and oud balance is beautiful. I wore it to a wedding and three people asked what I was wearing.',
    daysAgo: 34,
    verified: true,
  },
  {
    product: 'sahara-weekender-bag',
    customer: 'dawit@example.com',
    rating: 4,
    title: 'Beautiful leather, needs breaking in',
    body: 'The leather is thick and smells wonderful. It was stiff for the first week but has softened nicely. The shoulder strap is comfortable.',
    daysAgo: 20,
    verified: true,
  },
  {
    product: 'sahara-weekender-bag',
    customer: 'selam@example.com',
    rating: 5,
    title: 'Carry-on friendly and handsome',
    body: 'Fits three days of clothes and looks better every trip. The brass zips feel solid and the lining is easy to wipe clean.',
    daysAgo: 49,
    verified: true,
  },
  {
    product: 'lumen-fit-s2',
    customer: 'abel@example.com',
    rating: 4,
    title: 'Battery life is the highlight',
    body: 'I charge it once a week at most. Sleep tracking matches how I feel, and the GPS locks quickly on morning runs.',
    daysAgo: 16,
    verified: true,
  },
  {
    product: 'lumen-fit-s2',
    customer: 'customer@nilemart.et',
    rating: 4,
    title: 'Slim and comfortable overnight',
    body: 'The 40mm case is a good size for my wrist and the strap does not irritate. Notifications are useful, though the app could be clearer.',
    daysAgo: 40,
    verified: true,
  },
  {
    product: 'rift-runner-sneakers',
    customer: 'ruth@example.com',
    rating: 4,
    title: 'Light and springy',
    body: 'Did 10km on the first run with no blisters. The toe box is roomy and the foam feels responsive without being unstable.',
    daysAgo: 10,
    verified: true,
  },
  {
    product: 'rift-runner-sneakers',
    customer: 'yonas@example.com',
    rating: 5,
    title: 'Great daily trainer',
    body: 'I use them for treadmill sessions and walking around the city. They clean up easily and the sizing advice was accurate.',
    daysAgo: 31,
  },
  {
    product: 'kokeb-ergo-office-chair',
    customer: 'dawit@example.com',
    rating: 5,
    title: 'Back pain is gone',
    body: 'The lumbar support is genuinely adjustable and the seat depth makes a difference. Assembly was straightforward and everything aligned.',
    daysAgo: 13,
    verified: true,
  },
  {
    product: 'kokeb-ergo-office-chair',
    customer: 'selam@example.com',
    rating: 4,
    title: 'Solid chair, arms could be softer',
    body: 'Very stable and quiet when reclining. The armrest pads are firm after a long day, but the mesh back keeps me cool.',
    daysAgo: 36,
    verified: true,
  },
  {
    product: 'keystroke-k87-keyboard',
    customer: 'dawit@example.com',
    rating: 5,
    title: 'Typing this review on it',
    body: 'The gasket mount gives a soft, quiet thock and the keycaps feel durable. Bluetooth switching between my laptop and iPad is seamless.',
    daysAgo: 19,
    verified: true,
  },
  {
    product: 'keystroke-k87-keyboard',
    customer: 'abel@example.com',
    rating: 4,
    title: 'Great board, no numpad',
    body: 'Build quality is excellent for the price. I miss the numpad for spreadsheets, but the extra desk space is worth it.',
    daysAgo: 45,
    verified: true,
  },
  {
    product: 'kokeb-kilim-throw',
    customer: 'customer@nilemart.et',
    rating: 5,
    title: 'The texture is wonderful',
    body: 'It looks handmade in the best way and the colours match the photos. Big enough to share on the sofa without a fight.',
    daysAgo: 23,
    verified: true,
  },
  {
    product: 'kokeb-ceramic-table-lamp',
    customer: 'selam@example.com',
    rating: 5,
    title: 'Warm, soft light',
    body: 'The linen shade gives a lovely glow in the evening. The ceramic base feels substantial and the switch is easy to reach.',
    daysAgo: 35,
    verified: true,
  },
  {
    product: 'glow-lab-argan-hair-oil',
    customer: 'ruth@example.com',
    rating: 5,
    title: 'Tames frizz without grease',
    body: 'Two drops on damp hair and my curls are defined all day. It has no heavy perfume smell, which I appreciate.',
    daysAgo: 8,
    verified: true,
  },
  {
    product: 'glow-lab-argan-hair-oil',
    customer: 'customer@nilemart.et',
    rating: 4,
    title: 'Good everyday oil',
    body: 'Absorbs quickly and adds shine to dry ends. The dropper is a little slow, but the bottle lasts a long time.',
    daysAgo: 27,
  },
  {
    product: 'rift-flow-yoga-mat',
    customer: 'abel@example.com',
    rating: 4,
    title: 'Grippy and supportive',
    body: 'No slipping even during a sweaty vinyasa. It is heavier than my old mat, but the strap makes carrying it easy.',
    daysAgo: 30,
    verified: true,
  },
  {
    product: 'rift-trek-35l-backpack',
    customer: 'yonas@example.com',
    rating: 5,
    title: 'Perfect carry-on',
    body: 'Took it as hand luggage on a work trip, then used it for a weekend hike. The back panel really does keep you cooler.',
    daysAgo: 21,
    verified: true,
  },
  {
    product: 'quill-notebook-set',
    customer: 'abel@example.com',
    rating: 4,
    title: 'Paper handles fountain pens',
    body: 'No feathering or bleed with my medium nib. The dotted notebook has become my daily planner.',
    daysAgo: 17,
    verified: true,
  },
  {
    product: 'quill-executive-pen-set',
    customer: 'dawit@example.com',
    rating: 5,
    title: 'Feels far more expensive than it is',
    body: 'Good weight, smooth refills and the stand looks smart on my desk. The gift box makes it an easy present.',
    daysAgo: 25,
  },
  {
    product: 'rift-ironcore-dumbbell-set',
    customer: 'yonas@example.com',
    rating: 4,
    title: 'Solid home set',
    body: 'Rubber coating protects the floor and the knurling is comfortable. The 15kg pair is heavier than it sounds after a few sets.',
    daysAgo: 44,
    verified: true,
  },
  {
    product: 'vertex-view-27-qhd',
    customer: 'dawit@example.com',
    rating: 5,
    title: 'Colour accuracy is excellent',
    body: 'Edits look the same on my phone and in print. USB-C charging my laptop through the monitor keeps the desk tidy.',
    daysAgo: 32,
    verified: true,
  },
  {
    product: 'voltedge-65w-gan-charger',
    customer: 'yonas@example.com',
    rating: 5,
    title: 'Replaced three chargers',
    body: 'One brick for my laptop, phone and earbuds. It stays cool and the folding pins make it easy to pack.',
    daysAgo: 28,
    verified: true,
  },
  {
    product: 'nile-tab-11',
    customer: 'customer@nilemart.et',
    rating: 4,
    title: 'Great for study and films',
    body: 'The screen is sharp and the speakers are surprisingly good. I wish the stylus were included, but the tablet itself is excellent value.',
    daysAgo: 39,
  },
  {
    product: 'addis-cotton-oxford-shirt',
    customer: 'abel@example.com',
    rating: 5,
    title: 'Soft from the first wear',
    body: 'No stiffness out of the bag and the collar holds its shape after washing. I ordered a second one in the same size.',
    daysAgo: 20,
  },
  {
    product: 'rift-trek-35l-backpack',
    customer: 'selam@example.com',
    rating: 4,
    title: 'Roomy and well organised',
    body: 'The laptop sleeve is well padded and the front pocket fits a rain jacket. The hip belt helps on longer walks.',
    daysAgo: 50,
  },
];

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export interface SeedBanner {
  title: string;
  subtitle: string;
  eyebrow: string;
  image: string;
  link: string;
  linkLabel: string;
  placement: 'hero' | 'promo' | 'category';
  theme: 'navy' | 'light' | 'gold';
  position: number;
}

export const banners: SeedBanner[] = [
  {
    title: 'Everything you need, delivered across Ethiopia',
    subtitle: 'Genuine electronics, considered homeware and everyday essentials — with fast delivery from Addis Ababa.',
    eyebrow: 'Nile Mart — new season',
    image: 'hero',
    link: '/products',
    linkLabel: 'Shop the collection',
    placement: 'hero',
    theme: 'navy',
    position: 0,
  },
  {
    title: 'Warmth for the home you are building',
    subtitle: 'Handwoven textiles, ceramic lamps and small rituals. Up to 20% off selected home pieces.',
    eyebrow: 'Home & living',
    image: 'promo-home',
    link: '/category/home-living?deals=1',
    linkLabel: 'Explore home offers',
    placement: 'promo',
    theme: 'light',
    position: 0,
  },
  {
    title: 'Beauty, bottled',
    subtitle: 'Clinically minded skincare and fragrance from Glow Lab and Sente.',
    eyebrow: 'Beauty edit',
    image: 'promo-beauty',
    link: '/category/beauty-personal-care',
    linkLabel: 'Shop beauty',
    placement: 'promo',
    theme: 'gold',
    position: 1,
  },
];

export interface SeedCoupon {
  code: string;
  description: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrder: number;
  maxDiscount?: number;
  usageLimit?: number;
  perUserLimit: number;
  appliesTo: 'all' | 'products' | 'categories';
  categories?: string[];
}

export const coupons: SeedCoupon[] = [
  {
    code: 'WELCOME10',
    description: '10% off your first order over ETB 1,000',
    type: 'percentage',
    value: 1000,
    minOrder: etb(1000),
    maxDiscount: etb(500),
    usageLimit: 500,
    perUserLimit: 1,
    appliesTo: 'all',
  },
  {
    code: 'NILE500',
    description: 'ETB 500 off orders over ETB 3,000',
    type: 'fixed',
    value: etb(500),
    minOrder: etb(3000),
    usageLimit: 300,
    perUserLimit: 2,
    appliesTo: 'all',
  },
  {
    code: 'TECH15',
    description: '15% off electronics and computing over ETB 5,000',
    type: 'percentage',
    value: 1500,
    minOrder: etb(5000),
    maxDiscount: etb(2000),
    usageLimit: 200,
    perUserLimit: 1,
    appliesTo: 'categories',
    categories: ['electronics', 'phones-accessories', 'computers-accessories'],
  },
];

export const newsletterSubscribers = [
  { email: 'customer@nilemart.et', source: 'checkout' },
  { email: 'dawit@example.com', source: 'footer' },
  { email: 'selam@example.com', source: 'footer' },
  { email: 'yonas@example.com', source: 'checkout' },
  { email: 'ruth@example.com', source: 'footer' },
  { email: 'abel@example.com', source: 'footer' },
  { email: 'meron@example.com', source: 'footer' },
  { email: 'kalkidan@example.com', source: 'footer' },
];

export const freeShippingThreshold = etb(3000);

export const deliveryMethods = {
  standard: { label: 'Standard delivery', fee: etb(150), eta: '2-4 business days' },
  express: { label: 'Express delivery', fee: etb(300), eta: 'Next business day' },
  pickup: { label: 'Collect in store', fee: 0, eta: 'Ready in 2 hours' },
} as const;
