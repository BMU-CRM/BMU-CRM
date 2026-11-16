// Emoji reactions, and GIFs and stickers from GIPHY, tested as real signed-in users.
import { beforeAll, describe, expect, it } from 'vitest';
import { isSingleEmoji, searchEmoji } from '@/lib/messages/emojiList';
import { isGiphyMediaUrl } from '@/lib/messages/giphyUrl';
import { gifMessageSchema, reactionSchema } from '@/lib/validation/messageSchema';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();
const gifUrl = 'https://media2.giphy.com/media/v1.Y2lkPTc5/3o7abKhOpu0NwenH3O/200w.webp?cid=79&rid=200w.webp&ct=g';

describe('chat reactions, GIFs and stickers', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let direct = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('sender', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('reader', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('outsider', 'Employee', 'Finance', 'founder');
    const { data } = await as.sender!.rpc('get_or_create_direct_conversation', { p_other: ids.reader! });
    direct = data as string;
  });

  async function send(values: Record<string, unknown>) {
    return as.sender!
      .from('messages')
      .insert({ conversation_id: direct, ...values } as never)
      .select('id')
      .single();
  }

  describe('reactions', () => {
    it('keeps one reaction per person, replaced by a new one and taken back by an empty one', async () => {
      const { data: message } = await send({ body: 'Shipped the release' });

      expect((await as.reader!.rpc('react_to_message', { p_message: message!.id, p_emoji: '👍' })).error).toBeNull();
      expect((await as.reader!.rpc('react_to_message', { p_message: message!.id, p_emoji: '🎉' })).error).toBeNull();
      expect((await as.sender!.rpc('react_to_message', { p_message: message!.id, p_emoji: '❤️' })).error).toBeNull();

      const { data: both } = await as.sender!
        .from('message_reactions')
        .select('emoji, employee_id')
        .eq('message_id', message!.id)
        .order('created_at');
      expect(both).toEqual([
        { emoji: '🎉', employee_id: ids.reader },
        { emoji: '❤️', employee_id: ids.sender },
      ]);

      await as.reader!.rpc('react_to_message', { p_message: message!.id, p_emoji: '' });
      const { data: after } = await as.sender!.from('message_reactions').select('employee_id').eq('message_id', message!.id);
      expect(after).toEqual([{ employee_id: ids.sender }]);
    });

    it('keeps people outside the conversation from reacting or seeing reactions', async () => {
      const { data: message } = await send({ body: 'Private' });
      await as.reader!.rpc('react_to_message', { p_message: message!.id, p_emoji: '👍' });

      const refused = await as.outsider!.rpc('react_to_message', { p_message: message!.id, p_emoji: '👍' });
      expect(refused.error?.message).toContain('cannot react');
      expect((await as.outsider!.from('message_reactions').select('emoji').eq('message_id', message!.id)).data).toEqual([]);
    });

    it('refuses text in place of an emoji, and direct writes to the table', async () => {
      const { data: message } = await send({ body: 'Hi' });
      const text = await as.reader!.rpc('react_to_message', { p_message: message!.id, p_emoji: 'lol' });
      expect(text.error).not.toBeNull();

      const direct_write = await as.reader!
        .from('message_reactions')
        .insert({ message_id: message!.id, conversation_id: direct, employee_id: ids.reader!, emoji: '👍' } as never);
      expect(direct_write.error).not.toBeNull();
    });

    it('clears reactions when a message is deleted for everyone, and refuses new ones', async () => {
      const { data: message } = await send({ body: 'Oops' });
      await as.reader!.rpc('react_to_message', { p_message: message!.id, p_emoji: '😂' });

      await as.sender!.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', message!.id).select('id');
      const { data: left } = await admin.from('message_reactions').select('emoji').eq('message_id', message!.id);
      expect(left).toEqual([]);

      const late = await as.reader!.rpc('react_to_message', { p_message: message!.id, p_emoji: '😂' });
      expect(late.error?.message).toContain('cannot react');
    });
  });

  describe('GIFs and stickers', () => {
    it('sends a GIF and names it in the conversation list', async () => {
      const { error } = await send({ gif_kind: 'gif', gif_url: gifUrl, gif_title: 'Celebrate', gif_width: 200, gif_height: 150 });
      expect(error).toBeNull();

      const { data } = await as.reader!.rpc('get_my_conversations');
      expect((data ?? []).find((conversation) => conversation.id === direct)?.last_message_body).toBe('GIF');
    });

    it('refuses an image from any site other than GIPHY', async () => {
      const elsewhere = await send({ gif_kind: 'gif', gif_url: 'https://example.com/cat.gif', gif_width: 200, gif_height: 150 });
      expect(elsewhere.error).not.toBeNull();
      const lookalike = await send({ gif_kind: 'sticker', gif_url: 'https://media.giphy.com.evil.io/x.gif' });
      expect(lookalike.error).not.toBeNull();
      const noKind = await send({ gif_url: gifUrl });
      expect(noKind.error).not.toBeNull();
    });

    it('cannot swap a sent sticker, and deleting it for everyone removes it', async () => {
      const { data: sticker } = await send({ gif_kind: 'sticker', gif_url: gifUrl, gif_width: 200, gif_height: 200 });

      const swapped = await as.sender!.from('messages').update({ gif_url: gifUrl.replace('200w', '100w') } as never).eq('id', sticker!.id);
      expect(swapped.error?.message).toContain('cannot be changed');

      await as.sender!.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', sticker!.id).select('id');
      const { data: gone } = await admin.from('messages').select('gif_url, gif_kind').eq('id', sticker!.id).single();
      expect(gone).toEqual({ gif_url: null, gif_kind: null });
    });
  });

  describe('checks in the app', () => {
    it('accepts only GIPHY image addresses', () => {
      expect(isGiphyMediaUrl(gifUrl)).toBe(true);
      expect(isGiphyMediaUrl('https://i.giphy.com/abc.webp')).toBe(true);
      expect(isGiphyMediaUrl('http://media.giphy.com/media/abc/200w.gif')).toBe(false);
      expect(isGiphyMediaUrl('https://media.giphy.com.evil.io/abc.gif')).toBe(false);
      expect(isGiphyMediaUrl('https://giphy.com/gifs/abc')).toBe(false);
      expect(isGiphyMediaUrl('javascript:alert(1)')).toBe(false);
      expect(gifMessageSchema.safeParse({ kind: 'gif', url: gifUrl, title: '', width: 200, height: 150, replyToId: '' }).success).toBe(true);
    });

    it('accepts one emoji as a reaction, or nothing', () => {
      for (const emoji of ['👍', '❤️', '🧑‍💻', '🇮🇳', '👍🏽']) expect(isSingleEmoji(emoji)).toBe(true);
      for (const text of ['ok', '1', '👍 ok', '<b>']) expect(isSingleEmoji(text)).toBe(false);
      expect(reactionSchema.safeParse('').success).toBe(true);
      expect(searchEmoji('thumbs')).toContain('👍');
    });
  });
});
