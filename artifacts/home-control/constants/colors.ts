/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#202721',
    tint: '#244B3D',

    // Core surfaces
    background: '#F3F0E8',
    foreground: '#202721',

    // Cards / elevated surfaces
    card: '#FFFEFA',
    cardForeground: '#202721',

    // Primary action color (buttons, links, active states)
    primary: '#244B3D',
    primaryForeground: '#F8F4E8',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E7E9DF',
    secondaryForeground: '#29362E',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#E9E7DE',
    mutedForeground: '#72796F',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#E9B952',
    accentForeground: '#2A3028',

    // Destructive actions (delete, error states)
    destructive: '#B9563E',
    destructiveForeground: '#FFFFFF',

    // Borders and input outlines
    border: '#DEDDD2',
    input: '#DEDDD2',
  },

  dark: {
    text: '#F1F0E7',
    tint: '#A9D3B4',
    background: '#151D19',
    foreground: '#F1F0E7',
    card: '#202A24',
    cardForeground: '#F1F0E7',
    primary: '#A9D3B4',
    primaryForeground: '#14201A',
    secondary: '#2B3830',
    secondaryForeground: '#E7E9DF',
    muted: '#2B3830',
    mutedForeground: '#A2AEA5',
    accent: '#DAB25D',
    accentForeground: '#21261F',
    destructive: '#E18A72',
    destructiveForeground: '#241713',
    border: '#39453C',
    input: '#39453C',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 20,
};

export default colors;
