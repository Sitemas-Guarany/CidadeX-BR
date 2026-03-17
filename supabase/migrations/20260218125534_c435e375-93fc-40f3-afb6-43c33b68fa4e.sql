-- Add foreign key from posts.user_id to profiles.user_id
ALTER TABLE public.posts
ADD CONSTRAINT posts_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);

-- Add foreign key from post_reposts.user_id to profiles.user_id
ALTER TABLE public.post_reposts
ADD CONSTRAINT post_reposts_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);