import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,box-shadow,border-color] outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/20',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3.5 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1 px-2.5 has-[>svg]:px-2',
        lg: 'h-10 px-6',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-xs': 'size-7 rounded-md',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
