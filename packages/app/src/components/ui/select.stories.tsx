import type { Meta, StoryObj } from '@storybook/react'

const Select = ({ options, ...props }: { options: string[] } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    {...props}
  >
    {options.map((opt) => (
      <option key={opt} value={opt}>
        {opt}
      </option>
    ))}
  </select>
)

const meta: Meta<typeof Select> = {
  title: 'Design System/Select',
  component: Select,
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof Select>

export const Default: Story = {
  args: {
    options: ['Select an option', 'Option 1', 'Option 2', 'Option 3'],
  },
}

export const Categories: Story = {
  args: {
    options: ['Select category', 'Plumber', 'Electrician', 'Carpenter', 'Painter', 'Welder'],
  },
}

export const Disabled: Story = {
  args: {
    options: ['Select an option', 'Option 1', 'Option 2'],
    disabled: true,
  },
}

export const WithValue: Story = {
  args: {
    options: ['Select an option', 'Option 1', 'Option 2', 'Option 3'],
    defaultValue: 'Option 2',
  },
}
