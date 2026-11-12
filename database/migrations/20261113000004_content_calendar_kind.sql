-- A calendar entry type for content work (posters, shoots, reels), next to meetings. Enum
-- values must be committed before they are used, so it has a migration of its own.

alter type public.meeting_kind add value if not exists 'content';
