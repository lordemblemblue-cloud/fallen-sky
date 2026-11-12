import { toast } from 'react-hot-toast';

const message = (error) =>
  error?.response?.data?.error || error?.message || 'Something went wrong. Please try again.';

export function showError(error, action = 'Request') {
  if (error) console.warn(`[${action}]`, error);
  toast.error(`${action} failed. ${message(error)}`, { duration: 5000, position: 'top-center' });
}

export function showSuccess(text) {
  toast.success(text, { duration: 3000, position: 'top-center' });
}