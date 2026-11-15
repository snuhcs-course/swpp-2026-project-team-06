import { Image, type ImageStyle, type StyleProp } from "react-native";

const variants = {
  wordmark: {
    source: require("../assets/brand/logo-wordmark.display.webp"),
    width: 174,
    height: 56,
  },
  icon: {
    source: require("../assets/brand/logo-icon.display.webp"),
    width: 36,
    height: 40,
  },
  monochrome: {
    source: require("../assets/brand/logo-grayscale.display.webp"),
    width: 172,
    height: 129,
  },
  full: {
    source: require("../assets/brand/logo-paper-glow-clean.display.webp"),
    width: 172,
    height: 129,
  },
};

export function BrandLogo({
  variant,
  width,
  decorative = false,
  style,
}: {
  variant: keyof typeof variants;
  width?: number;
  decorative?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  const logo = variants[variant];
  const renderedWidth = width ?? logo.width;
  return (
    <Image
      testID={`brand-logo-${variant}`}
      source={logo.source}
      resizeMode="contain"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : "Farmclub"}
      aria-hidden={decorative || undefined}
      style={[
        {
          width: renderedWidth,
          height: (renderedWidth / logo.width) * logo.height,
          flexShrink: 0,
        },
        style,
      ]}
    />
  );
}
