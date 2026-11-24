export interface Testimonial {
  name: string;
  role: string;
  company: string;
  quote: string;
  /** ISO date the person agreed in writing that we may publish this quote. */
  consentDate: string;
  url?: string;
}

/** Only real, consented quotes. Leave this empty until Mees adds one. */
export const testimonials: Testimonial[] = [];
