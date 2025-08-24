// Logo Configuration for IJDR Portal
// This file helps manage logo assets and provides easy switching between different versions

export interface LogoConfig {
  src: string;
  alt: string;
  width: number;
  height: number;
  type: 'main' | 'icon' | 'text' | 'dark' | 'light';
}

export const logoAssets: Record<string, LogoConfig> = {
  // Main logo with text (for header)
  main: {
    src: '/assets/images/logos/ijdr-logo-main.png',
    alt: 'IJDR - Indian Journal of Development Research',
    width: 200,
    height: 60,
    type: 'main',
  },

  // Icon only version (for favicon, mobile)
  icon: {
    src: '/assets/images/logos/ijdr-icon.png',
    alt: 'IJDR Logo',
    width: 60,
    height: 60,
    type: 'icon',
  },

  // Text only version (for minimal layouts)
  text: {
    src: '/assets/images/logos/ijdr-text.png',
    alt: 'IJDR - Development Research',
    width: 150,
    height: 40,
    type: 'text',
  },

  // Dark background version
  dark: {
    src: '/assets/images/logos/ijdr-logo-dark.png',
    alt: 'IJDR Logo - Dark Version',
    width: 200,
    height: 60,
    type: 'dark',
  },

  // Light background version
  light: {
    src: '/assets/images/logos/ijdr-logo-light.png',
    alt: 'IJDR Logo - Light Version',
    width: 200,
    height: 60,
    type: 'light',
  },
};

// Current placeholder configuration (replace these with your actual assets)
export const placeholderLogos: Record<string, LogoConfig> = {
  main: {
    src: 'https://picsum.photos/200/60?random=12',
    alt: 'IJDR - Academic Excellence',
    width: 200,
    height: 60,
    type: 'main',
  },

  icon: {
    src: 'https://picsum.photos/60/60?random=13',
    alt: 'IJDR Logo',
    width: 60,
    height: 60,
    type: 'icon',
  },
};

// Helper function to get logo based on context
export function getLogo(
  context: 'header' | 'footer' | 'mobile' | 'favicon',
  theme: 'light' | 'dark' = 'light'
): LogoConfig {
  // Use placeholder until actual assets are available
  const useActualLogos = false; // Set to true when you have actual logo files
  const logoSet = useActualLogos ? logoAssets : placeholderLogos;

  switch (context) {
    case 'header':
      return theme === 'dark'
        ? logoSet['dark'] || logoSet['main']
        : logoSet['main'];
    case 'footer':
      return logoSet['light'] || logoSet['main'];
    case 'mobile':
      return logoSet['icon'] || logoSet['main'];
    case 'favicon':
      return logoSet['icon'] || logoSet['main'];
    default:
      return logoSet['main'];
  }
}

// Brand configuration
export const brandConfig = {
  name: 'IJDR',
  fullName: 'Indian Journal of Development Research',
  tagline: 'Development Research',
  description:
    'Advancing development studies through rigorous research and academic excellence',
  colors: {
    primary: '#3B82F6',
    secondary: '#1E293B',
    accent: '#A855F7',
  },
};

// Social media and branding assets
export const socialAssets = {
  favicon: '/assets/images/logos/favicon.ico',
  appleTouchIcon: '/assets/images/logos/apple-touch-icon.png',
  ogImage: '/assets/images/logos/og-image.png', // For social media sharing
  twitterImage: '/assets/images/logos/twitter-image.png',
};

// Usage examples:
/*
// In a component:
import { getLogo, brandConfig } from '../assets/logo-config';

const headerLogo = getLogo('header', 'light');
const footerLogo = getLogo('footer');

// In template:
<img [src]="headerLogo.src" [alt]="headerLogo.alt" [width]="headerLogo.width" [height]="headerLogo.height">
*/
