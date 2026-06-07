import iconPng from '../../assets/icon.png';

interface AppIconProps {
  size?: number;
  className?: string;
  rounded?: boolean;
}

/**
 * The application's brand icon (the Windows 11 controls trio) rendered as
 * the bundled PNG. Used in the title bar, tab bar, empty state, and About
 * page so every visual surface shows the actual product icon instead of
 * an inline SVG or emoji placeholder.
 */
export function AppIcon({ size = 24, className, rounded = true }: AppIconProps) {
  return (
    <img
      src={iconPng}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? Math.max(2, size * 0.18) : 0,
        objectFit: 'cover',
        flexShrink: 0,
        userSelect: 'none',
        pointerEvents: 'none'
      }}
    />
  );
}
