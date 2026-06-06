declare module "picomatch" {
  export interface PicomatchOptions {
    dot?: boolean;
    nocase?: boolean;
  }

  export default function picomatch(
    pattern: string | string[],
    options?: PicomatchOptions,
  ): (input: string) => boolean;
}
