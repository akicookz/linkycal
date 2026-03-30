WITH ranked AS (
  SELECT
    `id`,
    `user_id`,
    ROW_NUMBER() OVER (
      PARTITION BY `user_id`
      ORDER BY
        CASE WHEN `stripe_subscription_id` IS NOT NULL THEN 1 ELSE 0 END DESC,
        CASE WHEN `stripe_customer_id` IS NOT NULL THEN 1 ELSE 0 END DESC,
        CASE WHEN `plan` != 'free' THEN 1 ELSE 0 END DESC,
        `updated_at` DESC,
        `created_at` DESC,
        `id` DESC
    ) AS `row_num`
  FROM `subscriptions`
)
UPDATE `subscriptions`
SET
  `stripe_customer_id` = COALESCE(
    `stripe_customer_id`,
    (
      SELECT `s2`.`stripe_customer_id`
      FROM `subscriptions` AS `s2`
      WHERE `s2`.`user_id` = `subscriptions`.`user_id`
        AND `s2`.`stripe_customer_id` IS NOT NULL
      ORDER BY
        CASE WHEN `s2`.`stripe_subscription_id` IS NOT NULL THEN 1 ELSE 0 END DESC,
        `s2`.`updated_at` DESC,
        `s2`.`created_at` DESC,
        `s2`.`id` DESC
      LIMIT 1
    )
  ),
  `stripe_subscription_id` = COALESCE(
    `stripe_subscription_id`,
    (
      SELECT `s2`.`stripe_subscription_id`
      FROM `subscriptions` AS `s2`
      WHERE `s2`.`user_id` = `subscriptions`.`user_id`
        AND `s2`.`stripe_subscription_id` IS NOT NULL
      ORDER BY
        `s2`.`updated_at` DESC,
        `s2`.`created_at` DESC,
        `s2`.`id` DESC
      LIMIT 1
    )
  )
WHERE `id` IN (
  SELECT `id`
  FROM ranked
  WHERE `row_num` = 1
);
--> statement-breakpoint
WITH ranked AS (
  SELECT
    `id`,
    ROW_NUMBER() OVER (
      PARTITION BY `user_id`
      ORDER BY
        CASE WHEN `stripe_subscription_id` IS NOT NULL THEN 1 ELSE 0 END DESC,
        CASE WHEN `stripe_customer_id` IS NOT NULL THEN 1 ELSE 0 END DESC,
        CASE WHEN `plan` != 'free' THEN 1 ELSE 0 END DESC,
        `updated_at` DESC,
        `created_at` DESC,
        `id` DESC
    ) AS `row_num`
  FROM `subscriptions`
)
DELETE FROM `subscriptions`
WHERE `id` IN (
  SELECT `id`
  FROM ranked
  WHERE `row_num` > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_user_id_unique` ON `subscriptions` (`user_id`);
