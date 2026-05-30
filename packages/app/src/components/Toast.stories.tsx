import type { Meta, StoryObj } from '@storybook/react'

const Toast = ({ message, type = 'info' }: any) => {
  const typeStyles = {
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  }
  return (
    <div className={`border rounded-md p-4 ${typeStyles[type]}`} role="alert">
      {message}
    </div>
  )
}

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['success', 'error', 'info', 'warning'],
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Success: Story = {
  args: {
    message: 'Operation completed successfully!',
    type: 'success',
  },
}

export const Error: Story = {
  args: {
    message: 'An error occurred. Please try again.',
    type: 'error',
  },
}

export const Info: Story = {
  args: {
    message: 'This is an informational message.',
    type: 'info',
  },
}

export const Warning: Story = {
  args: {
    message: 'Please be careful with this action.',
    type: 'warning',
  },
}
