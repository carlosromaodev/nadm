-- O papel da aplicação só publica e consulta avaliações; não as apaga ou reescreve.
GRANT SELECT, INSERT ON "reviews" TO nadm_app;
