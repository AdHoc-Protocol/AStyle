import type { Request, Response } from 'express';

export interface User{
id:number;
name:string;
email?:string;
}

type Handler<
TRequest extends Request,
TResult=void,
>=(req:TRequest,res:Response)=>Promise<TResult>;

export enum Role {Admin='admin',User='user'}

export class UserService<T extends User=User>{
private users:Map<number,T>=new Map();
constructor(private readonly repo:Repository<T>){}

async find(id:number):Promise<T|undefined>{
if(this.users.has(id)) return this.users.get(id);
const user=await this.repo.load(id);
if(user!==undefined&&user.name.length>0) { this.users.set(id,user); }
else if (!user)
{
return undefined;
}
return user??undefined;
}

byRole(role:Role):T[]{
switch(role){
case Role.Admin: return [...this.users.values()].filter(u=>u.id<10);
default: return [];
}
}
}

export const handler:Handler<Request>=async(req,res)=>{
const id=Number(req.params.id);
res.json(await service.find(id)??{error:'not found'});
};
