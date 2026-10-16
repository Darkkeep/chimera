export const chimeraTheme = {
  "colors": {
    "void": "#090B0F",
    "carbon": "#151A20",
    "gunmetal": "#28313A",
    "titanium": "#B9C2CA",
    "whiteHot": "#F3F6F8",
    "ignition": "#FF6A21",
    "afterburn": "#FFB02E",
    "pythiaLink": "#7F5CFF",
    "cyanSignal": "#26D0FF",
    "success": "#48C78E",
    "warning": "#FFB02E",
    "danger": "#FF4D4D"
  },
  "radii": {
    "sm": 6,
    "md": 10,
    "lg": 16
  },
  "motion": {
    "fast": 120,
    "standard": 180,
    "deliberate": 260
  }
} as const;

export type ChimeraTheme = typeof chimeraTheme;
