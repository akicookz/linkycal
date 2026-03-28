ALTER TABLE `form_steps` ADD `rich_description` text;
--> statement-breakpoint
UPDATE `form_steps`
SET `rich_description` = CASE
  WHEN `description` IS NULL OR trim(`description`) = '' THEN NULL
  ELSE '<p>' ||
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(REPLACE(`description`, '&', '&amp;'), '<', '&lt;'),
          '>',
          '&gt;'
        ),
        char(13),
        ''
      ),
      char(10),
      '<br>'
    ) ||
  '</p>'
END;
