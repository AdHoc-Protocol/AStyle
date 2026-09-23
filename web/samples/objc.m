#import <Foundation/Foundation.h>

@interface Account : NSObject
@property(nonatomic,strong) NSString *owner;
-(instancetype)initWithOwner:(NSString*)owner balance:(double)balance;
-(BOOL)withdraw:(double)amount error:(NSError**)error;
@end

@implementation Account
{
double _balance;
}
-(instancetype)initWithOwner:(NSString*)owner balance:(double)balance{
if(self=[super init]){
_owner=owner;
_balance=balance;
}
return self;
}
- (BOOL) withdraw : (double) amount error : (NSError **) error
{
if(amount>_balance){
if(error) *error=[NSError errorWithDomain:@"bank" code:1 userInfo:nil];
return NO;
}
_balance-=amount;
[self notifyOwner:_owner
amount:amount
date:[NSDate date]];
return YES;
}
@end
