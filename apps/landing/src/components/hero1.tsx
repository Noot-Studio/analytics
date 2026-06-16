import { ArrowRight } from "lucide-react";

import { OptimizedImage } from "@/components/optimized-image";
import { Button } from "@/components/ui/button";
import { APP_URL, DOCS_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

import dashboardPicture from "../assets/dashboard-overview.png?format=avif;webp&w=640;960;1280;1536&as=picture";

interface Image {
  picture: typeof dashboardPicture;
  alt: string;
}
interface Button {
  text: string;
  url: string;
  icon?: React.ReactNode;
}
interface Buttons {
  primary?: Button;
  secondary?: Button;
  tertiary?: Button;
}

interface HeroBasicProps {
  heading: string;
  description: string;
  buttons?: Buttons;
  image: Image;
  className?: string;
}

type Props = Partial<HeroBasicProps>;

const defaultProps: HeroBasicProps = {
  buttons: {
    primary: {
      text: "Get started free",
      url: APP_URL,
    },
    secondary: {
      text: "Self-hosting guide",
      url: DOCS_URL,
    },
  },
  description:
    "Track any in-game event in real time, then explore it through dashboards and in-editor.",
  heading: "Open-source analytics for your s&box game",
  image: {
    alt: "Noot Analytics dashboard showing the project overview with the events-per-day chart and event breakdown",
    picture: dashboardPicture,
  },
};

const Hero1 = (props: Props) => {
  const { heading, description, buttons, image, className } = {
    ...defaultProps,
    ...props,
  };

  return (
    <section className={cn("py-32", className)}>
      <div className="container mx-auto">
        <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-pretty md:text-5xl lg:max-w-3xl lg:text-6xl">
              {heading}
            </h1>
            <p className="max-w-5xl text-balance text-muted-foreground lg:text-xl">
              {description}
            </p>
            <div className="flex w-full flex-col justify-center gap-2 sm:flex-row lg:justify-start">
              {buttons?.primary && (
                <Button
                  size="lg"
                  className="w-full sm:w-auto"
                  render={
                    <a
                      aria-label={buttons.primary.text}
                      href={buttons.primary.url}
                    />
                  }
                  nativeButton={false}
                >
                  {buttons.primary.text}
                  <ArrowRight className="size-4" />
                </Button>
              )}
              {buttons?.secondary && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                  render={
                    <a
                      aria-label={buttons.secondary.text}
                      href={buttons.secondary.url}
                      rel="noopener"
                      target="_blank"
                    />
                  }
                  nativeButton={false}
                >
                  {buttons.secondary.text}
                </Button>
              )}
            </div>
          </div>
          <OptimizedImage
            picture={image.picture}
            alt={image.alt}
            loading="eager"
            sizes="(min-width: 1024px) 580px, 100vw"
            className="aspect-video w-full rounded-md border border-border object-cover object-top"
          />
        </div>
      </div>
    </section>
  );
};

export { Hero1 };
