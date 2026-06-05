import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Ic({ size = 14, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const I = {
  send: (p: IconProps) => (<Ic {...p}><path d="M4 12 20 4l-6 16-3-7-7-1Z" /></Ic>),
  chev: (p: IconProps) => (<Ic {...p}><path d="m6 9 6 6 6-6" /></Ic>),
  check: (p: IconProps) => (<Ic {...p}><path d="m5 12 5 5L20 7" /></Ic>),
  x: (p: IconProps) => (<Ic {...p}><path d="M6 6l12 12M18 6 6 18" /></Ic>),
  brain: (p: IconProps) => (
    <Ic {...p}>
      <path d="M9 4a3 3 0 0 0-3 3v0a3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V4" />
      <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3" />
    </Ic>
  ),
  wrench: (p: IconProps) => (<Ic {...p}><path d="M14 7a4 4 0 1 0 4 4l3 3-3 3-3-3a4 4 0 0 1-4-4l-3-3-3 3 3 3a4 4 0 0 0 6 0" /></Ic>),
  stop: (p: IconProps) => (<Ic {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Ic>),
  slash: (p: IconProps) => (<Ic {...p}><path d="M16 4 8 20" /></Ic>),
};
