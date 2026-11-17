export interface NavItem {
  href: string;
  label: string;
  /** Match nested routes as active. */
  prefix?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** App sidebar (brief section 8). The marketing mocks mirror these labels. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/app", label: "Dashboard" },
      { href: "/app/businesses", label: "Businesses", prefix: true },
      { href: "/app/clients", label: "Clients", prefix: true },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/app/ai-visibility", label: "AI Visibility", prefix: true },
      { href: "/app/maps-grid", label: "Maps Grid", prefix: true },
      { href: "/app/audit", label: "Local AI Audit", prefix: true },
      { href: "/app/prospects", label: "Prospects", prefix: true },
    ],
  },
  { label: "Developers", items: [{ href: "/app/developers", label: "API & MCP", prefix: true }] },
];

export const NAV_BOTTOM: NavGroup = {
  label: "Settings",
  items: [
    { href: "/app/settings/keys", label: "API keys", prefix: true },
    { href: "/app/settings/branding", label: "Branding", prefix: true },
    { href: "/app/billing", label: "Billing", prefix: true },
    { href: "/app/requests", label: "Requests", prefix: true },
  ],
};
