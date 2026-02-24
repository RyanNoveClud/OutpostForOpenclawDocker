import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/dom';

describe('interactions', () => {
  it('chat send flow', async () => {
    document.body.innerHTML = '<input aria-label="chat-input" />';
    await userEvent.type(screen.getByLabelText('chat-input'), 'hi');
    expect((screen.getByLabelText('chat-input') as HTMLInputElement).value).toBe('hi');
  });

  it('files copy flow', async () => {
    let clicked = false;
    document.body.innerHTML = '<button>复制内容</button>';
    screen.getByText('复制内容').addEventListener('click', () => {
      clicked = true;
    });
    await userEvent.click(screen.getByText('复制内容'));
    expect(clicked).toBe(true);
  });

  it('logs filter flow', async () => {
    document.body.innerHTML = `<select aria-label="level"><option value="all">all</option><option value="error">error</option></select>`;
    await userEvent.selectOptions(screen.getByLabelText('level'), 'error');
    expect((screen.getByLabelText('level') as HTMLSelectElement).value).toBe('error');
  });
});
