WITH `normalized_views` AS (
  SELECT
    `project_id`,
    CASE
      WHEN json_valid(`config`) = 0 THEN NULL
      WHEN json_type(`config`) = 'text'
        AND json_valid(json_extract(`config`, '$')) = 1
        THEN json_extract(`config`, '$')
      ELSE `config`
    END AS `config`
  FROM `contact_views`
  WHERE `type` = 'kanban' AND `config` IS NOT NULL
),
`stage_tags` AS (
  SELECT DISTINCT
    `normalized_views`.`project_id` AS `project_id`,
    `pivot`.`value` AS `tag_id`
  FROM `normalized_views`
  JOIN json_each(
    `normalized_views`.`config`,
    '$.pivotTagIds'
  ) AS `pivot`
  JOIN `tags`
    ON `tags`.`id` = `pivot`.`value`
    AND `tags`.`project_id` = `normalized_views`.`project_id`
  WHERE
    `normalized_views`.`config` IS NOT NULL
    AND json_type(
      `normalized_views`.`config`,
      '$.pivotTagIds'
    ) = 'array'
),
`ranked_assignments` AS (
  SELECT
    `contact_tags`.`contact_id` AS `contact_id`,
    `contact_tags`.`tag_id` AS `tag_id`,
    row_number() OVER (
      PARTITION BY `contact_tags`.`contact_id`
      ORDER BY
        coalesce((
          SELECT max(`contact_activity`.`created_at`)
          FROM `contact_activity`
          WHERE
            `contact_activity`.`contact_id` =
              `contact_tags`.`contact_id`
            AND `contact_activity`.`type` = 'tag_added'
            AND `contact_activity`.`reference_id` =
              `contact_tags`.`tag_id`
        ), 0) DESC,
        `contact_tags`.`tag_id` ASC
    ) AS `stage_rank`
  FROM `contact_tags`
  JOIN `contacts`
    ON `contacts`.`id` = `contact_tags`.`contact_id`
  JOIN `stage_tags`
    ON `stage_tags`.`project_id` = `contacts`.`project_id`
    AND `stage_tags`.`tag_id` = `contact_tags`.`tag_id`
)
DELETE FROM `contact_tags`
WHERE EXISTS (
  SELECT 1
  FROM `ranked_assignments`
  WHERE
    `ranked_assignments`.`stage_rank` > 1
    AND `ranked_assignments`.`contact_id` =
      `contact_tags`.`contact_id`
    AND `ranked_assignments`.`tag_id` = `contact_tags`.`tag_id`
);
