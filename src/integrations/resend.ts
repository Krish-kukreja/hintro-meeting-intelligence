import { Resend } from 'resend';
import logger from '../utils/logger';
import { env } from '../config/env';

const resend = new Resend(env.RESEND_API_KEY);

interface ActionItemForEmail {
  id: string;
  task: string;
  assignee: string;
  dueDate: Date | null;
}

export async function sendReminderEmail(
  item: ActionItemForEmail,
  traceId: string
): Promise<{ success: boolean; error?: string }> {
  const dueDateFormatted = item.dueDate
    ? item.dueDate.toISOString().split('T')[0]
    : 'Not set';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #d32f2f;">Action Item Overdue</h2>
      <p><strong>Task:</strong> ${item.task}</p>
      <p><strong>Assigned To:</strong> ${item.assignee}</p>
      <p><strong>Due Date:</strong> ${dueDateFormatted}</p>
      <hr style="border: 1px solid #eee;" />
      <p style="color: #666;">Please update the status of this action item.</p>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: item.assignee,
      subject: `⏰ Overdue: ${item.task}`,
      html: htmlContent,
    });

    if (error) {
      logger.error('Resend API returned error', {
        traceId,
        actionItemId: item.id,
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    logger.info('Reminder email sent successfully', {
      traceId,
      actionItemId: item.id,
      assignee: item.assignee,
      resendId: data?.id,
    });

    return { success: true };
  } catch (err) {
    const errorMessage = (err as Error).message;
    logger.error('Failed to send reminder email', {
      traceId,
      actionItemId: item.id,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}
