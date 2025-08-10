import { Link2 } from "lucide-react";
import type { SVGProps } from "react";
import {
  siFacebook,
  siGoogle,
  siInstagram,
  siMessenger,
  siWhatsapp,
  siX,
} from "simple-icons";

const createSimpleIcon = (icon: { path: string; hex: string }) => {
  const SimpleIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      {...props}
    >
      <path d={icon.path} />
    </svg>
  );
  SimpleIcon.displayName = `SimpleIcon(${icon.hex})`;
  return SimpleIcon;
};

export const Icons = {
  Logo: (props: SVGProps<SVGSVGElement>) => (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M3 10V14M7.5 7.5V16.5M12 5V19M16.5 7.5V16.5M21 10V14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Facebook: createSimpleIcon(siFacebook),
  Google: createSimpleIcon(siGoogle),
  Twitter: createSimpleIcon(siX),
  Instagram: createSimpleIcon(siInstagram),
  WhatsApp: createSimpleIcon(siWhatsapp),
  Messenger: createSimpleIcon(siMessenger),
  Link: (props: React.ComponentProps<"svg">) => <Link2 {...props} />,
  MetallicIcon: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="50" cy="50" r="50" fill="url(#metallicGradient)" />
      <defs>
        <radialGradient
          id="metallicGradient"
          cx="50%"
          cy="50%"
          r="50%"
          fx="50%"
          fy="50%"
        >
          <stop
            offset="0%"
            style={{ stopColor: "var(--widget-accent-color)", stopOpacity: 1 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: "var(--widget-primary-color)", stopOpacity: 1 }}
          />
        </radialGradient>
      </defs>
    </svg>
  ),
};
